import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Smartphone,
  Wifi,
  Wallet,
  Loader2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";

// ── Types ─────────────────────────────────────────────────────────────

interface Network {
  id: string;
  name: string;
  [key: string]: any;
}

interface DataPlan {
  plan_code: string;
  name: string;
  price: number;
  [key: string]: any;
}

interface ElectricityItem {
  item_code: string;
  biller_code: string;
  name: string;
  amount: number;
  fee: number;
}

// ── Constants ─────────────────────────────────────────────────────────

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

const NETWORK_COLORS: Record<string, string> = {
  mtn: "border-yellow-500 bg-yellow-500/10 text-yellow-600",
  glo: "border-green-600 bg-green-600/10 text-green-700",
  airtel: "border-red-500 bg-red-500/10 text-red-600",
  "9mobile": "border-green-500 bg-green-500/10 text-green-600",
};

function getNetworkStyle(nameOrId: string): string {
  const lower = nameOrId.toLowerCase();
  for (const key of Object.keys(NETWORK_COLORS)) {
    if (lower.includes(key)) return NETWORK_COLORS[key];
  }
  return "border-border bg-card text-foreground";
}

const PHONE_REGEX = /^0[789]\d{9}$/;

type RecentAirtime = { phoneNumber: string; network: string; amount: number; label?: string; savedAt: number };
type RecentData = { phoneNumber: string; network: string; planCode: string; planName: string; label?: string; savedAt: number };
type RecentElectricity = { meterNumber: string; disco: string; itemName: string; itemCode: string; amount: number; fee: number; savedAt: number };

type FavoriteAirtime = RecentAirtime;
type FavoriteData = RecentData;
type FavoriteElectricity = RecentElectricity & { };

type LastRequest = { endpoint: string; body: Record<string, unknown> };

type LocalHistoryItem = {
  kind: "airtime" | "data" | "electricity";
  title: string;
  amount: number;
  total: number;
  ref?: string;
  at: number;
};

const RECENT_LIMIT = 6;
const FAVORITE_LIMIT = 6;
const HISTORY_LIMIT = 10;

const STORAGE_KEYS = {
  airtime: "vura_recent_airtime",
  data: "vura_recent_data",
  electricity: "vura_recent_electricity",
  favAirtime: "vura_fav_airtime",
  favData: "vura_fav_data",
  favElectricity: "vura_fav_electricity",
  history: "vura_bills_history",
  lastRequest: "vura_bills_last_request"
};

const loadRecents = <T,>(key: string): T[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveRecents = <T,>(key: string, items: T[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(items.slice(0, RECENT_LIMIT)));
  } catch {
    /* ignore quota errors */
  }
};

const loadList = <T,>(key: string, limit: number): T[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, limit) : [];
  } catch {
    return [];
  }
};

const saveList = <T,>(key: string, items: T[], limit: number) => {
  try {
    localStorage.setItem(key, JSON.stringify(items.slice(0, limit)));
  } catch {
    /* ignore quota errors */
  }
};

const detectNetwork = (phone: string): { airtimeId?: string; dataId?: string } => {
  // Basic NG prefixes mapping to carrier
  const prefix = phone.slice(0, 4);
  const mtn = ["0803", "0806", "0703", "0706", "0813", "0816", "0810", "0814", "0903", "0906", "0913", "0916"];
  const glo = ["0805", "0807", "0705", "0811", "0815", "0905", "0915"];
  const airtel = ["0802", "0808", "0708", "0812", "0701", "0902", "0901", "0907", "0912"];
  const nineMobile = ["0809", "0817", "0818", "0909", "0908"];

  if (mtn.includes(prefix)) return { airtimeId: "mtn", dataId: "BIL108" };
  if (glo.includes(prefix)) return { airtimeId: "glo", dataId: "BIL109" };
  if (airtel.includes(prefix)) return { airtimeId: "airtel", dataId: "BIL110" };
  if (nineMobile.includes(prefix)) return { airtimeId: "9mobile", dataId: "BIL111" };
  return {};
};

// ── Component ─────────────────────────────────────────────────────────

type BillTab = "airtime" | "data" | "electricity";

const Bills = () => {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab: BillTab =
    tabParam === "data"
      ? "data"
      : tabParam === "electricity"
        ? "electricity"
        : "airtime";

  const [tab, setTab] = useState<BillTab>(initialTab);
  const [step, setStep] = useState<"form" | "confirm" | "success" | "error">("form");

  // Shared
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [purchaseResult, setPurchaseResult] = useState<any>(null);

  // Airtime
  const [airtimeAmount, setAirtimeAmount] = useState("");
  const [airtimeNetworks, setAirtimeNetworks] = useState<Network[]>([]);
  const [airtimeNetworksLoading, setAirtimeNetworksLoading] = useState(true);

  // Data
  const [dataNetworks, setDataNetworks] = useState<Network[]>([]);
  const [dataNetworksLoading, setDataNetworksLoading] = useState(true);
  const [dataPlans, setDataPlans] = useState<DataPlan[]>([]);
  const [dataPlansLoading, setDataPlansLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<DataPlan | null>(null);

  // Electricity
  const [discos, setDiscos] = useState<Network[]>([]);
  const [discosLoading, setDiscosLoading] = useState(true);
  const [selectedDisco, setSelectedDisco] = useState<string>("");
  const [electricityItems, setElectricityItems] = useState<ElectricityItem[]>([]);
  const [electricityItemsLoading, setElectricityItemsLoading] = useState(false);
  const [selectedElectricityItem, setSelectedElectricityItem] = useState<ElectricityItem | null>(null);
  const [meterNumber, setMeterNumber] = useState("");
  const [meterValidated, setMeterValidated] = useState(false);
  const [meterCustomerName, setMeterCustomerName] = useState<string>("");
  const [electricityAmount, setElectricityAmount] = useState("");
  const [validatingMeter, setValidatingMeter] = useState(false);
  const [lastValidated, setLastValidated] = useState<{ meter: string; item: string } | null>(null);

  // Balance
  const [balance, setBalance] = useState<string | null>(null);

  // Recents
  const [recentAirtime, setRecentAirtime] = useState<RecentAirtime[]>([]);
  const [recentData, setRecentData] = useState<RecentData[]>([]);
  const [recentElectricity, setRecentElectricity] = useState<RecentElectricity[]>([]);

  // Favorites
  const [favAirtime, setFavAirtime] = useState<FavoriteAirtime[]>([]);
  const [favData, setFavData] = useState<FavoriteData[]>([]);
  const [favElectricity, setFavElectricity] = useState<FavoriteElectricity[]>([]);

  // History (local only for now)
  const [history, setHistory] = useState<LocalHistoryItem[]>([]);

  // Last request (for retry)
  const [lastRequest, setLastRequest] = useState<LastRequest | null>(null);

  // Favorite toggles/labels
  const [saveAsFavorite, setSaveAsFavorite] = useState(false);
  const [favoriteLabel, setFavoriteLabel] = useState("");

  const navigate = useNavigate();

  // ── Fetch networks on mount ─────────────────────────────────────────

  const fetchAirtimeNetworks = useCallback(async () => {
    setAirtimeNetworksLoading(true);
    try {
      const res = await apiFetch("/bills/airtime/networks");
      if (!res.ok) return;
      const json = await res.json();
      setAirtimeNetworks(json.data ?? []);
    } catch {
      // silent
    } finally {
      setAirtimeNetworksLoading(false);
    }
  }, []);

  const fetchDataNetworks = useCallback(async () => {
    setDataNetworksLoading(true);
    try {
      const res = await apiFetch("/bills/data/networks");
      if (!res.ok) return;
      const json = await res.json();
      setDataNetworks(json.data ?? []);
    } catch {
      // silent
    } finally {
      setDataNetworksLoading(false);
    }
  }, []);

  const fetchElectricityDiscos = useCallback(async () => {
    setDiscosLoading(true);
    try {
      const res = await apiFetch("/bills/electricity/discos");
      if (!res.ok) return;
      const json = await res.json();
      setDiscos(json.data ?? []);
    } catch {
      // silent
    } finally {
      setDiscosLoading(false);
    }
  }, []);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await apiFetch("/user/balance");
      if (!res.ok) return;
      const json = await res.json();
      setBalance(json.data?.NGN ?? json.data?.ngn ?? null);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchAirtimeNetworks();
    fetchDataNetworks();
    fetchElectricityDiscos();
    fetchBalance();
    setRecentAirtime(loadRecents<RecentAirtime>(STORAGE_KEYS.airtime));
    setRecentData(loadRecents<RecentData>(STORAGE_KEYS.data));
    setRecentElectricity(loadRecents<RecentElectricity>(STORAGE_KEYS.electricity));
    setFavAirtime(loadList<FavoriteAirtime>(STORAGE_KEYS.favAirtime, FAVORITE_LIMIT));
    setFavData(loadList<FavoriteData>(STORAGE_KEYS.favData, FAVORITE_LIMIT));
    setFavElectricity(loadList<FavoriteElectricity>(STORAGE_KEYS.favElectricity, FAVORITE_LIMIT));
    setHistory(loadList<LocalHistoryItem>(STORAGE_KEYS.history, HISTORY_LIMIT));
    const lrRaw = loadList<LastRequest>(STORAGE_KEYS.lastRequest, 1);
    if (lrRaw.length > 0) setLastRequest(lrRaw[0]);
  }, [fetchAirtimeNetworks, fetchDataNetworks, fetchElectricityDiscos, fetchBalance]);

  // ── Fetch data plans when network changes ───────────────────────────

  useEffect(() => {
    if (tab !== "data" || !selectedNetwork) {
      setDataPlans([]);
      setSelectedPlan(null);
      return;
    }

    let cancelled = false;
    setDataPlansLoading(true);
    setSelectedPlan(null);

    (async () => {
      try {
        const res = await apiFetch(`/bills/data/plans?network=${selectedNetwork}`);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        setDataPlans(json.data ?? []);
      } catch {
        setDataPlans([]);
      } finally {
        if (!cancelled) setDataPlansLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [tab, selectedNetwork]);

  // ── Fetch electricity items when disco changes ────────────────────────
  useEffect(() => {
    if (tab !== "electricity" || !selectedDisco) {
      setElectricityItems([]);
      setSelectedElectricityItem(null);
      return;
    }
    let cancelled = false;
    setElectricityItemsLoading(true);
    setSelectedElectricityItem(null);
    (async () => {
      try {
        const res = await apiFetch(`/bills/electricity/items?disco=${selectedDisco}`);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        setElectricityItems(json.data ?? []);
      } catch {
        setElectricityItems([]);
      } finally {
        if (!cancelled) setElectricityItemsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, selectedDisco]);

  // ── Handlers ────────────────────────────────────────────────────────

  const resetForm = () => {
    setStep("form");
    setPhoneNumber("");
    setSelectedNetwork("");
    setAirtimeAmount("");
    setSelectedPlan(null);
    setPurchaseResult(null);
    setSelectedDisco("");
    setSelectedElectricityItem(null);
    setMeterNumber("");
    setMeterValidated(false);
    setMeterCustomerName("");
    setElectricityAmount("");
  };

  const switchTab = (newTab: BillTab) => {
    setTab(newTab);
    resetForm();
  };

  const canConfirmAirtime =
    selectedNetwork &&
    PHONE_REGEX.test(phoneNumber) &&
    parseFloat(airtimeAmount) >= 50 &&
    parseFloat(airtimeAmount) <= 50000;

  const canConfirmData =
    selectedNetwork && PHONE_REGEX.test(phoneNumber) && selectedPlan;

  const canConfirmElectricity =
    selectedDisco &&
    selectedElectricityItem &&
    meterNumber.length >= 6 &&
    meterValidated &&
    parseFloat(electricityAmount) >= 500 &&
    parseFloat(electricityAmount) <= 500000;

  const currentAmount =
    tab === "airtime"
      ? parseFloat(airtimeAmount) || 0
      : tab === "data"
        ? selectedPlan?.price ?? 0
        : parseFloat(electricityAmount) || 0;

  const electricityFee = selectedElectricityItem?.fee ?? 100;
  const electricityTotal = tab === "electricity" ? currentAmount + electricityFee : 0;

  const handleValidateMeter = async () => {
    if (!selectedElectricityItem || !meterNumber.trim()) {
      toast({ title: "Error", description: "Select a meter type and enter meter number", variant: "destructive" });
      return;
    }

    // Cached validation: if same meter + item was validated recently, skip revalidate
    if (lastValidated && lastValidated.meter === meterNumber && lastValidated.item === selectedElectricityItem.item_code) {
      return;
    }
    setValidatingMeter(true);
    try {
      const res = await apiFetch("/bills/electricity/validate", {
        method: "POST",
        body: JSON.stringify({
          meterNumber: meterNumber.trim(),
          itemCode: selectedElectricityItem.item_code,
          billerCode: selectedElectricityItem.biller_code,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Validation failed");
      }
      setMeterValidated(true);
      setMeterCustomerName(json.data?.customerName ?? "Valid");
      setLastValidated({ meter: meterNumber.trim(), item: selectedElectricityItem.item_code });
      toast({ title: "Meter verified", description: json.data?.customerName ?? "You can proceed." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Meter validation failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
      setMeterValidated(false);
    } finally {
      setValidatingMeter(false);
    }
  };

  const handleConfirm = async () => {
    const parsedAirtime = parseFloat(airtimeAmount);
    const parsedElectricity = parseFloat(electricityAmount);

    if (tab !== "electricity" && !PHONE_REGEX.test(phoneNumber)) {
      toast({ title: "Invalid phone", description: "Enter a valid Nigerian number (e.g. 08012345678)", variant: "destructive" });
      return;
    }

    if (tab === "airtime" && (parsedAirtime < 50 || parsedAirtime > 50000)) {
      toast({ title: "Amount out of range", description: "Airtime must be between ₦50 and ₦50,000", variant: "destructive" });
      return;
    }

    if (tab === "electricity" && (parsedElectricity < 500 || parsedElectricity > 500000)) {
      toast({ title: "Amount out of range", description: "Electricity must be between ₦500 and ₦500,000", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      let endpoint: string;
      let body: Record<string, unknown>;
      if (tab === "airtime") {
        endpoint = "/bills/airtime";
        body = { network: selectedNetwork, amount: parseFloat(airtimeAmount), phoneNumber };
      } else if (tab === "data") {
        endpoint = "/bills/data";
        body = { network: selectedNetwork, planCode: selectedPlan!.plan_code, phoneNumber };
      } else {
        endpoint = "/bills/electricity";
        const meterType = selectedElectricityItem!.name.toLowerCase().includes("prepaid") ? "prepaid" : "postpaid";
        body = {
          meterNumber: meterNumber.trim(),
          amount: parseFloat(electricityAmount),
          disco: selectedDisco,
          type: meterType,
          itemName: selectedElectricityItem!.name,
          itemCode: selectedElectricityItem!.item_code,
          fee: electricityFee,
        };
      }

      const requestPayload: LastRequest = { endpoint, body };
      setLastRequest(requestPayload);
      saveList(STORAGE_KEYS.lastRequest, [requestPayload], 1);

      const res = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.message || "Purchase failed");
      }

      setPurchaseResult(json.data ?? json);
      const now = Date.now();
      if (tab === "airtime") {
        const entry: RecentAirtime = { phoneNumber, network: selectedNetwork, amount: parseFloat(airtimeAmount), savedAt: now };
        const next = [entry, ...recentAirtime.filter((r) => r.phoneNumber !== phoneNumber)].slice(0, RECENT_LIMIT);
        setRecentAirtime(next);
        saveRecents(STORAGE_KEYS.airtime, next);
      } else if (tab === "data" && selectedPlan) {
        const entry: RecentData = { phoneNumber, network: selectedNetwork, planCode: selectedPlan.plan_code, planName: selectedPlan.name, savedAt: now };
        const next = [entry, ...recentData.filter((r) => !(r.phoneNumber === phoneNumber && r.planCode === selectedPlan.plan_code))].slice(0, RECENT_LIMIT);
        setRecentData(next);
        saveRecents(STORAGE_KEYS.data, next);
      } else if (tab === "electricity" && selectedElectricityItem) {
        const entry: RecentElectricity = {
          meterNumber,
          disco: selectedDisco,
          itemName: selectedElectricityItem.name,
          itemCode: selectedElectricityItem.item_code,
          amount: parseFloat(electricityAmount),
          fee: electricityFee,
          savedAt: now,
        };
        const next = [entry, ...recentElectricity.filter((r) => r.meterNumber !== meterNumber)].slice(0, RECENT_LIMIT);
        setRecentElectricity(next);
        saveRecents(STORAGE_KEYS.electricity, next);
      }

      const historyEntry: LocalHistoryItem = {
        kind: tab,
        title:
          tab === "airtime"
            ? `Airtime to ${phoneNumber}`
            : tab === "data"
              ? `${selectedPlan?.name ?? "Data"} for ${phoneNumber}`
              : `Electricity for ${meterNumber}`,
        amount: tab === "electricity" ? currentAmount : (tab === "data" ? selectedPlan?.price ?? currentAmount : currentAmount),
        total: tab === "electricity" ? electricityTotal : currentAmount,
        ref: json.data?.reference ?? json.reference,
        at: now,
      };
      const nextHistory = [historyEntry, ...history].slice(0, HISTORY_LIMIT);
      setHistory(nextHistory);
      saveList(STORAGE_KEYS.history, nextHistory, HISTORY_LIMIT);

      if (saveAsFavorite) {
        if (tab === "airtime") {
          const entry: FavoriteAirtime = { phoneNumber, network: selectedNetwork, amount: parseFloat(airtimeAmount), label: favoriteLabel || undefined, savedAt: now };
          const next = [entry, ...favAirtime.filter((f) => f.phoneNumber !== phoneNumber)].slice(0, FAVORITE_LIMIT);
          setFavAirtime(next);
          saveList(STORAGE_KEYS.favAirtime, next, FAVORITE_LIMIT);
        } else if (tab === "data" && selectedPlan) {
          const entry: FavoriteData = { phoneNumber, network: selectedNetwork, planCode: selectedPlan.plan_code, planName: selectedPlan.name, label: favoriteLabel || undefined, savedAt: now };
          const next = [entry, ...favData.filter((f) => !(f.phoneNumber === phoneNumber && f.planCode === selectedPlan.plan_code))].slice(0, FAVORITE_LIMIT);
          setFavData(next);
          saveList(STORAGE_KEYS.favData, next, FAVORITE_LIMIT);
        } else if (tab === "electricity" && selectedElectricityItem) {
          const entry: FavoriteElectricity = {
            meterNumber,
            disco: selectedDisco,
            itemName: selectedElectricityItem.name,
            itemCode: selectedElectricityItem.item_code,
            amount: parseFloat(electricityAmount),
            fee: electricityFee,
            label: favoriteLabel || undefined,
            savedAt: now,
          };
          const next = [entry, ...favElectricity.filter((f) => f.meterNumber !== meterNumber)].slice(0, FAVORITE_LIMIT);
          setFavElectricity(next);
          saveList(STORAGE_KEYS.favElectricity, next, FAVORITE_LIMIT);
        }
      }

      setStep("success");
      fetchBalance();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast({ title: "Error", description: message, variant: "destructive" });
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────

  const networksToShow =
    tab === "airtime" ? airtimeNetworks : tab === "data" ? dataNetworks : discos;
  const networksLoading =
    tab === "airtime" ? airtimeNetworksLoading : tab === "data" ? dataNetworksLoading : discosLoading;

  const selectedNetworkName = useMemo(() => {
    const nets = tab === "airtime" ? airtimeNetworks : tab === "data" ? dataNetworks : discos;
    const found = nets.find((n) => (n.id ?? n.identifier) === (tab === "electricity" ? selectedDisco : selectedNetwork));
    return found?.name || (tab === "electricity" ? selectedDisco : selectedNetwork);
  }, [tab, selectedNetwork, selectedDisco, airtimeNetworks, dataNetworks, discos]);

  // Auto-detect network from phone number for airtime/data
  useEffect(() => {
    if (tab === "airtime" || tab === "data") {
      const { airtimeId, dataId } = detectNetwork(phoneNumber);
      if (tab === "airtime" && airtimeId && !selectedNetwork) {
        setSelectedNetwork(airtimeId);
      }
      if (tab === "data" && dataId && !selectedNetwork) {
        setSelectedNetwork(dataId);
      }
    }
  }, [phoneNumber, tab, selectedNetwork]);

  // Smart defaults: prefill last amount/plan for this number/meter
  useEffect(() => {
    if (tab === "airtime" && PHONE_REGEX.test(phoneNumber)) {
      const match = (favAirtime.find((f) => f.phoneNumber === phoneNumber) || recentAirtime.find((r) => r.phoneNumber === phoneNumber));
      if (match) {
        setAirtimeAmount(match.amount.toString());
        if (match.network) setSelectedNetwork(match.network);
      }
    }
    if (tab === "data" && PHONE_REGEX.test(phoneNumber)) {
      const match = (favData.find((f) => f.phoneNumber === phoneNumber) || recentData.find((r) => r.phoneNumber === phoneNumber));
      if (match) {
        if (match.network) setSelectedNetwork(match.network);
        const plan = dataPlans.find((p) => p.plan_code === match.planCode);
        if (plan) setSelectedPlan(plan);
      }
    }
    if (tab === "electricity" && meterNumber.length >= 6) {
      const match = (favElectricity.find((f) => f.meterNumber === meterNumber) || recentElectricity.find((r) => r.meterNumber === meterNumber));
      if (match) {
        setSelectedDisco(match.disco);
        setElectricityAmount(match.amount.toString());
        const item = electricityItems.find((i) => i.item_code === match.itemCode);
        if (item) {
          setSelectedElectricityItem(item);
          setMeterValidated(false);
        }
      }
    }
  }, [tab, phoneNumber, meterNumber, recentAirtime, recentData, recentElectricity, favAirtime, favData, favElectricity, dataPlans, electricityItems]);

  const renderRecents = () => {
    if (tab === "airtime" && recentAirtime.length > 0) {
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Recent numbers</p>
          <div className="flex flex-wrap gap-2">
            {recentAirtime.map((r) => (
              <button
                key={`${r.phoneNumber}-${r.network}`}
                onClick={() => {
                  setPhoneNumber(r.phoneNumber);
                  setSelectedNetwork(r.network);
                  setAirtimeAmount(r.amount.toString());
                }}
                className="px-3 py-2 rounded-lg border text-xs hover:border-primary transition-colors"
              >
                {r.phoneNumber} · {r.network.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (tab === "data" && recentData.length > 0) {
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Recent data purchases</p>
          <div className="flex flex-wrap gap-2">
            {recentData.map((r) => (
              <button
                key={`${r.phoneNumber}-${r.planCode}`}
                onClick={() => {
                  setPhoneNumber(r.phoneNumber);
                  setSelectedNetwork(r.network);
                  const found = dataPlans.find((p) => p.plan_code === r.planCode);
                  if (found) setSelectedPlan(found);
                }}
                className="px-3 py-2 rounded-lg border text-xs hover:border-primary transition-colors"
              >
                {r.phoneNumber} · {r.planName}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (tab === "electricity" && recentElectricity.length > 0) {
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Recent meters</p>
          <div className="flex flex-wrap gap-2">
            {recentElectricity.map((r) => (
              <button
                key={`${r.meterNumber}-${r.itemCode}`}
                onClick={() => {
                  setSelectedDisco(r.disco);
                  setMeterNumber(r.meterNumber);
                  const item = electricityItems.find((i) => i.item_code === r.itemCode);
                  if (item) {
                    setSelectedElectricityItem(item);
                    setMeterValidated(false);
                  }
                  setElectricityAmount(r.amount.toString());
                }}
                className="px-3 py-2 rounded-lg border text-xs hover:border-primary transition-colors"
              >
                {r.meterNumber} · {r.itemName}
              </button>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  const renderFavorites = () => {
    if (tab === "airtime" && favAirtime.length > 0) {
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Favorites</p>
          <div className="flex flex-wrap gap-2">
            {favAirtime.map((f) => (
              <button
                key={`${f.phoneNumber}-${f.network}`}
                onClick={() => {
                  setPhoneNumber(f.phoneNumber);
                  setSelectedNetwork(f.network);
                  setAirtimeAmount(f.amount.toString());
                }}
                className="px-3 py-2 rounded-lg border text-xs hover:border-primary transition-colors"
              >
                {f.label || f.phoneNumber} · {f.network.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (tab === "data" && favData.length > 0) {
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Favorites</p>
          <div className="flex flex-wrap gap-2">
            {favData.map((f) => (
              <button
                key={`${f.phoneNumber}-${f.planCode}`}
                onClick={() => {
                  setPhoneNumber(f.phoneNumber);
                  setSelectedNetwork(f.network);
                  const found = dataPlans.find((p) => p.plan_code === f.planCode);
                  if (found) setSelectedPlan(found);
                }}
                className="px-3 py-2 rounded-lg border text-xs hover:border-primary transition-colors"
              >
                {f.label || f.phoneNumber} · {f.planName}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (tab === "electricity" && favElectricity.length > 0) {
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Favorites</p>
          <div className="flex flex-wrap gap-2">
            {favElectricity.map((f) => (
              <button
                key={`${f.meterNumber}-${f.itemCode}`}
                onClick={() => {
                  setSelectedDisco(f.disco);
                  setMeterNumber(f.meterNumber);
                  const item = electricityItems.find((i) => i.item_code === f.itemCode);
                  if (item) {
                    setSelectedElectricityItem(item);
                    setMeterValidated(false);
                  }
                  setElectricityAmount(f.amount.toString());
                }}
                className="px-3 py-2 rounded-lg border text-xs hover:border-primary transition-colors"
              >
                {f.label || f.meterNumber} · {f.itemName}
              </button>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  const renderHistory = () => {
    if (history.length === 0) return null;
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Recent bills</p>
          <button
            onClick={() => {
              setHistory([]);
              saveList(STORAGE_KEYS.history, [], HISTORY_LIMIT);
            }}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            Clear
          </button>
        </div>
        <div className="space-y-2">
          {history.map((h) => (
            <div key={`${h.kind}-${h.at}-${h.title}`} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{h.title}</p>
                <p className="text-xs text-muted-foreground">
                  ₦{h.total.toLocaleString()} · {new Date(h.at).toLocaleString()}
                  {h.ref ? ` · ${h.ref}` : ""}
                </p>
              </div>
              <span className="text-xs capitalize bg-muted px-2 py-1 rounded">
                {h.kind}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const retryLastRequest = async () => {
    if (!lastRequest) return;
    try {
      setLoading(true);
      const res = await apiFetch(lastRequest.endpoint, {
        method: "POST",
        body: JSON.stringify(lastRequest.body),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Retry failed");
      }
      toast({ title: "Retried successfully", description: "Bill paid" });
      setPurchaseResult(json.data ?? json);
      setStep("success");
      fetchBalance();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Retry failed";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-4 px-4 py-4 max-w-2xl mx-auto">
          <button
            onClick={() => (step === "form" ? navigate("/") : resetForm())}
            className="p-2 hover:bg-muted rounded-full transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold">
              {tab === "airtime" ? "Buy Airtime" : tab === "data" ? "Buy Data" : "Buy Electricity"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {tab === "electricity"
                ? "Prepaid & postpaid meter payments"
                : "Instant top-up to any Nigerian number"}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-6 pb-24">
        {/* Tab switcher */}
        <div className="flex rounded-xl bg-muted p-1">
          <button
            onClick={() => switchTab("airtime")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === "airtime"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Smartphone className="h-4 w-4 shrink-0" />
            Airtime
          </button>
          <button
            onClick={() => switchTab("data")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === "data"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Wifi className="h-4 w-4 shrink-0" />
            Data
          </button>
          <button
            onClick={() => switchTab("electricity")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === "electricity"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Zap className="h-4 w-4 shrink-0" />
            Electricity
          </button>
        </div>

        {/* Balance card */}
        {balance !== null && (
          <div className="rounded-xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 p-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Available Balance</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              ₦{parseFloat(balance).toLocaleString()}
            </p>
          </div>
        )}

        {/* ── Form Step ──────────────────────────────────────────── */}
        {step === "form" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Network / Disco selection */}
            <div>
              <label className="text-sm font-medium mb-3 block">
                {tab === "electricity" ? "Select Disco" : "Select Network"}
              </label>
              {renderRecents()}
              {renderFavorites()}
              <div className="flex items-center gap-2 mb-2">
                <input
                  id="save-fav"
                  type="checkbox"
                  checked={saveAsFavorite}
                  onChange={(e) => setSaveAsFavorite(e.target.checked)}
                  className="h-4 w-4"
                />
                <label htmlFor="save-fav" className="text-xs text-muted-foreground">
                  Save this as favorite
                </label>
                {saveAsFavorite && (
                  <input
                    placeholder="Label (optional)"
                    value={favoriteLabel}
                    onChange={(e) => setFavoriteLabel(e.target.value)}
                    className="flex-1 h-8 px-2 rounded border border-border text-xs"
                  />
                )}
              </div>
              {networksLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {networksToShow.map((net) => {
                    const netId = net.id ?? net.identifier ?? net.network_id;
                    const netName = net.name || netId;
                    const isSelected =
                      tab === "electricity" ? selectedDisco === netId : selectedNetwork === netId;
                    return (
                      <button
                        key={netId}
                        onClick={() =>
                          tab === "electricity" ? setSelectedDisco(netId) : setSelectedNetwork(netId)
                        }
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                          isSelected
                            ? getNetworkStyle(netName)
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <div className="flex-1 text-left">
                          <p className="font-semibold text-sm">{netName}</p>
                        </div>
                        {isSelected && (
                          <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Electricity: meter type (item) */}
            {tab === "electricity" && selectedDisco && (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Meter type
                </label>
                {electricityItemsLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : electricityItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No plans for this disco</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {electricityItems.map((item) => {
                      const isSelected = selectedElectricityItem?.item_code === item.item_code;
                      return (
                        <button
                          key={item.item_code}
                          onClick={() => {
                            setSelectedElectricityItem(item);
                            setMeterValidated(false);
                          }}
                          className={`w-full flex items-center justify-between p-3 rounded-xl border-2 text-left transition-all ${
                            isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">{item.name}</span>
                            <span className="text-[11px] text-muted-foreground">
                              Fee ₦{(item.fee ?? 0).toLocaleString()} · Total ₦{(item.amount + (item.fee ?? 0)).toLocaleString()}
                            </span>
                          </div>
                          {isSelected && (
                            <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                              <Check className="h-3 w-3 text-primary-foreground" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Meter number (electricity) */}
            {tab === "electricity" && selectedElectricityItem && (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Meter number
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={meterNumber}
                    onChange={(e) => {
                      setMeterNumber(e.target.value.replace(/\D/g, ""));
                      setMeterValidated(false);
                    }}
                    placeholder="e.g. 45145984782"
                    className="flex-1 bg-background rounded-xl border border-border px-4 py-3 text-base font-mono outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <Button
                    type="button"
                    variant={meterValidated ? "secondary" : "outline"}
                    onClick={handleValidateMeter}
                    disabled={validatingMeter || meterNumber.length < 6}
                    className="shrink-0 rounded-xl"
                  >
                    {validatingMeter ? <Loader2 className="h-4 w-4 animate-spin" /> : meterValidated ? "Verified" : "Verify"}
                  </Button>
                </div>
                {meterValidated && meterCustomerName && (
                  <p className="text-xs text-green-600 mt-1">✓ {meterCustomerName}</p>
                )}
              </div>
            )}

            {/* Phone number (airtime & data) */}
            {(tab === "airtime" || tab === "data") && (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  placeholder="08012345678"
                  className="w-full bg-background rounded-xl border border-border px-4 py-3 text-base font-mono outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            )}

            {/* Airtime: amount */}
            {tab === "airtime" && (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Amount (₦)
                </label>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {QUICK_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setAirtimeAmount(String(amt))}
                      className={`py-2.5 rounded-lg text-sm font-medium border transition-all ${
                        airtimeAmount === String(amt)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      ₦{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={airtimeAmount}
                  onChange={(e) => setAirtimeAmount(e.target.value)}
                  placeholder="Or enter custom amount"
                  min="50"
                  max="50000"
                  className="w-full bg-background rounded-xl border border-border px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Min: ₦50 &bull; Max: ₦50,000
                </p>
              </div>
            )}

            {/* Electricity: amount */}
            {tab === "electricity" && meterValidated && (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Amount (₦)
                </label>
                <input
                  type="number"
                  value={electricityAmount}
                  onChange={(e) => setElectricityAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  min="500"
                  max="500000"
                  className="w-full bg-background rounded-xl border border-border px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Min: ₦500 &bull; Max: ₦500,000 &bull; ₦100 fee applies
                </p>
              </div>
            )}

            {/* Data: plan selection */}
            {tab === "data" && selectedNetwork && (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Select Data Plan
                </label>
                {dataPlansLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : dataPlans.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No plans available for this network
                  </p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {dataPlans.map((plan) => {
                      const code = plan.plan_code;
                      const isSelected = selectedPlan?.plan_code === code;
                      return (
                        <button
                          key={code}
                          onClick={() => setSelectedPlan(plan)}
                          className={`w-full flex items-center justify-between p-3.5 rounded-xl border-2 transition-all text-left ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <div>
                            <p className="font-medium text-sm">{plan.name}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm">
                              ₦{(plan.price ?? 0).toLocaleString()}
                            </span>
                            {isSelected && (
                              <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                                <Check className="h-3 w-3 text-primary-foreground" />
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Continue button */}
            <Button
              onClick={() => setStep("confirm")}
              disabled={
                tab === "airtime"
                  ? !canConfirmAirtime
                  : tab === "data"
                    ? !canConfirmData
                    : !canConfirmElectricity
              }
              className="w-full h-14 rounded-xl gradient-brand text-primary-foreground font-semibold text-lg"
            >
              Continue
            </Button>
          </motion.div>
        )}

        {/* ── Confirm Step ─────────────────────────────────────────── */}
        {step === "confirm" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-5"
          >
            <div className="rounded-xl border-2 border-primary bg-primary/5 p-6 space-y-4">
              <h2 className="text-lg font-bold text-center">Confirm Purchase</h2>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium capitalize">{tab}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {tab === "electricity" ? "Disco" : "Network"}
                  </span>
                  <span className="font-medium">{selectedNetworkName}</span>
                </div>
                {tab === "electricity" ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Meter</span>
                      <span className="font-medium font-mono">{meterNumber}</span>
                    </div>
                    {selectedElectricityItem && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Meter type</span>
                        <span className="font-medium">{selectedElectricityItem.name}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Phone</span>
                    <span className="font-medium font-mono">{phoneNumber}</span>
                  </div>
                )}
                {tab === "data" && selectedPlan && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="font-medium">{selectedPlan.name}</span>
                  </div>
                )}
                <div className="border-t border-border my-2" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="text-xl font-bold">
                    ₦{(tab === "electricity" ? electricityTotal : currentAmount).toLocaleString()}
                  </span>
                </div>
                {tab === "electricity" && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Amount + ₦{electricityFee} fee</span>
                  </div>
                )}
                {balance !== null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Balance after</span>
                    <span className="font-medium">
                      ₦{(
                        parseFloat(balance) -
                        (tab === "electricity" ? electricityTotal : currentAmount)
                      ).toLocaleString()}
                    </span>
                  </div>
                )}
                {balance !== null && (tab === "electricity" ? electricityTotal : currentAmount) > parseFloat(balance) && (
                  <div className="text-xs text-destructive">
                    Balance too low. Please top up your wallet.
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setStep("form")}
                variant="outline"
                className="flex-1 h-12 rounded-xl"
                disabled={loading}
              >
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 h-12 rounded-xl gradient-brand text-primary-foreground font-semibold"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : tab === "airtime" ? (
                  "Buy Airtime"
                ) : tab === "data" ? (
                  "Buy Data"
                ) : (
                  "Pay Electricity"
                )}
              </Button>
            </div>
          </motion.div>
        )}

        {/* ── Success Step ─────────────────────────────────────────── */}
        <AnimatePresence>
          {step === "success" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl border-2 border-green-500/30 bg-green-500/5 p-6 text-center space-y-4"
            >
              <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                <Check className="h-8 w-8 text-green-500" />
              </div>
              <h2 className="text-xl font-bold">
                {tab === "airtime"
                  ? "Airtime Sent!"
                  : tab === "data"
                    ? "Data Activated!"
                    : "Electricity Paid!"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {tab === "airtime" ? (
                  <>
                    <span className="font-semibold text-foreground">
                      ₦{currentAmount.toLocaleString()}
                    </span>{" "}
                    airtime sent to{" "}
                    <span className="font-semibold text-foreground font-mono">
                      {phoneNumber}
                    </span>
                  </>
                ) : tab === "data" ? (
                  <>
                    <span className="font-semibold text-foreground">
                      {selectedPlan?.name}
                    </span>{" "}
                    data plan activated for{" "}
                    <span className="font-semibold text-foreground font-mono">
                      {phoneNumber}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-foreground">
                      ₦{electricityTotal.toLocaleString()}
                    </span>{" "}
                    electricity (incl. fee) paid for meter{" "}
                    <span className="font-semibold text-foreground font-mono">
                      {meterNumber}
                    </span>
                  </>
                )}
              </p>
              {tab === "electricity" && purchaseResult?.token && (
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Prepaid token</p>
                  <p className="font-mono font-bold text-base break-all">{purchaseResult.token}</p>
                  <div className="flex justify-center mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard?.writeText(String(purchaseResult.token)).then(() => {
                          toast({ title: "Token copied", description: "Paste into your meter" });
                        }).catch(() => {
                          toast({ title: "Copy failed", description: "Unable to copy token", variant: "destructive" });
                        });
                      }}
                      className="rounded-lg"
                    >
                      Copy token
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">Enter this on your meter</p>
                </div>
              )}
              {purchaseResult?.balanceAfter && (
                <p className="text-xs text-muted-foreground">
                  New balance: ₦{parseFloat(purchaseResult.balanceAfter).toLocaleString()}
                </p>
              )}
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => navigate("/")}
                  className="flex-1 rounded-xl gradient-brand text-primary-foreground font-semibold"
                >
                  <Wallet className="h-4 w-4 mr-2" />
                  Go to Wallet
                </Button>
                <Button onClick={resetForm} variant="outline" className="flex-1 rounded-xl">
                  Buy Again
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Error Step ───────────────────────────────────────────── */}
        <AnimatePresence>
          {step === "error" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl border-2 border-red-500/30 bg-red-500/5 p-6 text-center space-y-4"
            >
              <div className="mx-auto w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                <Smartphone className="h-8 w-8 text-red-500" />
              </div>
              <h2 className="text-xl font-bold">Purchase Failed</h2>
              <p className="text-sm text-muted-foreground">
                Something went wrong. Your balance has been refunded if it was debited.
              </p>
              <div className="flex gap-3 pt-2">
                <Button onClick={resetForm} variant="outline" className="flex-1 rounded-xl">
                  Try Again
                </Button>
                <Button
                  onClick={retryLastRequest}
                  disabled={!lastRequest || loading}
                  className="flex-1 rounded-xl"
                >
                  {loading ? "Retrying..." : "Retry last attempt"}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Local history */}
        <div className="mt-6">{renderHistory()}</div>
      </div>
    </div>
  );
};

export default Bills;
