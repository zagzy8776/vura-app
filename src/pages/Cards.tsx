import { motion } from "framer-motion";
import { CreditCard, Plus, Lock, Eye, EyeOff, Snowflake, Trash2, Copy, CheckCircle, CreditCard as CardIcon, AlertTriangle, Shield, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";
import { useAuth, apiFetch } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

interface CardData {
  id: string;
  type: "Virtual" | "Physical";
  last4: string;
  expiry: string;
  balance: number;
  color: string;
  status: "active" | "frozen";
  cardNumber: string;
  createdAt: string;
}

const getCardColor = (type: "Virtual" | "Physical", index: number) => {
  const colors = ["gradient-card", "gradient-brand", "gradient-purple", "gradient-teal"];
  return colors[index % colors.length];
};

const Cards = () => {
  const { user } = useAuth();
  const [cards, setCards] = useState<CardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({});
  const [newCardOpen, setNewCardOpen] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [newCardType, setNewCardType] = useState<"Virtual" | "Physical">("Virtual");
  const [copiedPin, setCopiedPin] = useState(false);
  const [kycDialogOpen, setKycDialogOpen] = useState(false);

  // Check if user is KYC verified (tier 2+ required for cards)
  const isKycVerified = user?.kycTier && user.kycTier >= 2;

  // Fetch cards from API
  const fetchCards = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await apiFetch("/cards", { method: "GET" });
      
      if (response.ok) {
        const data = await response.json();
        // Add color to cards for UI
        const cardsWithColor = data.map((card: CardData, index: number) => ({
          ...card,
          color: getCardColor(card.type, index),
          balance: typeof card.balance === 'string' ? parseFloat(card.balance) : card.balance
        }));
        setCards(cardsWithColor);
      } else if (response.status === 401) {
        // Session expired - handled by apiFetch
      } else {
        console.error("Failed to fetch cards");
      }
    } catch (error) {
      console.error("Error fetching cards:", error);
    } finally {
      setLoading(false);
    }
  };

  // Load cards on mount and when user changes
  useEffect(() => {
    fetchCards();
  }, [user?.id]);

  const toggleDetails = (id: string) => {
    setShowDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleNewCardClick = () => {
    if (!isKycVerified) {
      setKycDialogOpen(true);
      return;
    }
    setNewCardOpen(true);
  };

  const handleCreateCard = async () => {
    try {
      setActionLoading("creating");
      const response = await apiFetch("/cards", {
        method: "POST",
        body: JSON.stringify({ type: newCardType, currency: "NGN" }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 400 && data.message?.includes("already have")) {
          toast({
            title: "Card Exists",
            description: data.message,
            variant: "destructive",
          });
        } else if (response.status === 400 && data.message?.includes("KYC")) {
          setNewCardOpen(false);
          setKycDialogOpen(true);
        } else {
          toast({
            title: "Error",
            description: data.message || "Failed to create card",
            variant: "destructive",
          });
        }
        return;
      }

      // Add new card to list with color
      const newCard: CardData = {
        ...data,
        color: getCardColor(data.type, cards.length),
        balance: typeof data.balance === 'string' ? parseFloat(data.balance) : data.balance
      };
      
      setCards((prev) => [newCard, ...prev]);
      setNewCardOpen(false);
      
      toast({
        title: "Card Created!",
        description: `Your new ${newCardType.toLowerCase()} card ending in ${data.last4} is ready to use. PIN: ${data.pin}`,
      });

      // Show PIN dialog for newly created card
      setSelectedCard(newCard);
      setPinDialogOpen(true);
      setCopiedPin(false);

    } catch (error) {
      console.error("Error creating card:", error);
      toast({
        title: "Error",
        description: "Failed to create card. Please try again.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleFreezeCard = async (cardId: string) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    const newStatus = card.status === "active" ? "frozen" : "active";

    try {
      setActionLoading(cardId);
      const response = await apiFetch(`/cards/${cardId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const data = await response.json();
        toast({
          title: "Error",
          description: data.message || "Failed to update card status",
          variant: "destructive",
        });
        return;
      }

      setCards((prev) =>
        prev.map((c) => {
          if (c.id === cardId) {
            return { ...c, status: newStatus };
          }
          return c;
        })
      );

      toast({
        title: newStatus === "frozen" ? "Card Frozen" : "Card Unfrozen",
        description: `Your card ending in ${card.last4} has been ${newStatus === "frozen" ? "frozen" : "unfrozen"}.`,
      });
    } catch (error) {
      console.error("Error updating card status:", error);
      toast({
        title: "Error",
        description: "Failed to update card status. Please try again.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    try {
      setActionLoading(cardId);
      const response = await apiFetch(`/cards/${cardId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        toast({
          title: "Error",
          description: data.message || "Failed to delete card",
          variant: "destructive",
        });
        return;
      }

      setCards((prev) => prev.filter((c) => c.id !== cardId));
      
      toast({
        title: "Card Deleted",
        description: `Your ${card.type.toLowerCase()} card ending in ${card.last4} has been deleted.`,
        variant: "destructive",
      });
    } catch (error) {
      console.error("Error deleting card:", error);
      toast({
        title: "Error",
        description: "Failed to delete card. Please try again.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleShowPIN = async (card: CardData) => {
    try {
      setActionLoading(card.id);
      const response = await apiFetch(`/cards/${card.id}/pin`, {
        method: "GET",
      });

      if (!response.ok) {
        const data = await response.json();
        toast({
          title: "Error",
          description: data.message || "Failed to retrieve PIN",
          variant: "destructive",
        });
        return;
      }

      const data = await response.json();
      setSelectedCard({ ...card, pin: data.pin });
      setPinDialogOpen(true);
      setCopiedPin(false);
    } catch (error) {
      console.error("Error fetching PIN:", error);
      toast({
        title: "Error",
        description: "Failed to retrieve card PIN. Please try again.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const copyPIN = () => {
    if (selectedCard?.pin) {
      navigator.clipboard.writeText(selectedCard.pin);
      setCopiedPin(true);
      toast({
        title: "PIN Copied!",
        description: "Your card PIN has been copied to clipboard.",
      });
      setTimeout(() => setCopiedPin(false), 2000);
    }
  };

  const formatBalance = (balance: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(balance);
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 ml-64 px-8 pb-8">
        <DashboardHeader />
        <div className="max-w-3xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Cards</h2>
              <p className="text-muted-foreground text-sm mt-1">Manage your virtual and physical cards</p>
            </div>
            <Button 
              onClick={handleNewCardClick}
              disabled={actionLoading !== null}
              className="rounded-xl gradient-brand text-primary-foreground font-semibold border-0 hover:opacity-90"
            >
              <Plus className="h-4 w-4 mr-1" /> New Card
            </Button>

            {/* KYC Required Dialog */}
            <Dialog open={kycDialogOpen} onOpenChange={setKycDialogOpen}>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Identity Verification Required
                  </DialogTitle>
                  <DialogDescription>
                    To prevent fraud and comply with financial regulations, you must verify your identity before creating cards.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <Shield className="h-5 w-5 text-amber-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-900">KYC Tier {user?.kycTier || 0} - Not Verified</p>
                        <p className="text-sm text-amber-700 mt-1">
                          Complete identity verification to unlock card creation and higher transaction limits.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>Required for card creation:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Valid government-issued ID (NIN, Passport, Driver's License)</li>
                      <li>Proof of address</li>
                      <li>Selfie verification</li>
                      <li>Biometric verification (BVN)</li>
                    </ul>
                  </div>
                </div>
                <DialogFooter className="flex-col sm:flex-row gap-2">
                  <Button variant="outline" onClick={() => setKycDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => {
                      setKycDialogOpen(false);
                      window.location.href = "/settings";
                    }}
                    className="gradient-brand text-primary-foreground"
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    Verify Identity
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* New Card Dialog */}
            <Dialog open={newCardOpen} onOpenChange={setNewCardOpen}>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Create New Card</DialogTitle>
                  <DialogDescription>
                    Choose the type of card you want to create. Virtual cards are instant, physical cards will be mailed to you.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setNewCardType("Virtual")}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        newCardType === "Virtual" 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <CreditCard className="h-8 w-8 mb-2 text-primary" />
                      <div className="font-semibold">Virtual Card</div>
                      <div className="text-xs text-muted-foreground">Instant & online only</div>
                    </button>
                    <button
                      onClick={() => setNewCardType("Physical")}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        newCardType === "Physical" 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <CardIcon className="h-8 w-8 mb-2 text-primary" />
                      <div className="font-semibold">Physical Card</div>
                      <div className="text-xs text-muted-foreground">Delivered to your address</div>
                    </button>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setNewCardOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateCard} 
                    disabled={actionLoading === "creating"}
                    className="gradient-brand text-primary-foreground"
                  >
                    {actionLoading === "creating" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Create {newCardType} Card
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="grid gap-6">
              {[1, 2].map((i) => (
                <div key={i} className="rounded-2xl overflow-hidden shadow-elevated">
                  <div className="p-6 bg-muted">
                    <Skeleton className="h-8 w-32 mb-8" />
                    <Skeleton className="h-8 w-full mb-4" />
                    <div className="flex justify-between">
                      <Skeleton className="h-6 w-24" />
                      <Skeleton className="h-6 w-16" />
                    </div>
                  </div>
                  <div className="bg-card border border-border border-t-0 p-4 flex gap-2">
                    <Skeleton className="h-9 w-28" />
                    <Skeleton className="h-9 w-24" />
                    <Skeleton className="h-9 w-20" />
                    <Skeleton className="h-9 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : cards.length === 0 ? (
            <div className="text-center py-16">
              <CardIcon className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Cards Yet</h3>
              <p className="text-muted-foreground mb-6">
                {isKycVerified 
                  ? "Create your first virtual or physical card to get started."
                  : "Complete identity verification to create cards and start spending."}
              </p>
              <Button 
                onClick={handleNewCardClick} 
                className="rounded-xl gradient-brand text-primary-foreground font-semibold border-0 hover:opacity-90"
              >
                <Plus className="h-4 w-4 mr-1" /> 
                {isKycVerified ? "Create Your First Card" : "Verify Identity to Create Card"}
              </Button>
            </div>
          ) : (
            <div className="grid gap-6">
              {cards.map((card, i) => (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="rounded-2xl overflow-hidden shadow-elevated"
                >
                  {/* Card visual */}
                  <div className={`${card.color} p-6 text-primary-foreground relative`}>
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        <span className="text-sm font-medium opacity-80">{card.type} Card</span>
                        {card.status === "frozen" && (
                          <span className="px-2 py-0.5 bg-white/20 rounded text-xs font-medium">FROZEN</span>
                        )}
                      </div>
                      <span className="text-xl font-bold tracking-tight">Vura</span>
                    </div>
                    <p className="text-2xl font-mono tracking-widest mb-4">
                      {showDetails[card.id] ? card.cardNumber : `•••• •••• •••• ${card.last4}`}
                    </p>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs opacity-60">Balance</p>
                        <p className="text-lg font-bold">{showDetails[card.id] ? formatBalance(card.balance) : "₦•••••••"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs opacity-60">Expires</p>
                        <p className="text-sm font-medium">{card.expiry}</p>
                      </div>
                    </div>
                  </div>

                  {/* Card actions */}
                  <div className="bg-card border border-border border-t-0 p-4 flex gap-2 flex-wrap">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-lg" 
                      onClick={() => toggleDetails(card.id)}
                    >
                      {showDetails[card.id] ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                      {showDetails[card.id] ? "Hide" : "Show"}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className={`rounded-lg ${card.status === "frozen" ? "text-amber-500 hover:text-amber-600" : ""}`}
                      disabled={actionLoading === card.id}
                      onClick={() => handleFreezeCard(card.id)}
                    >
                      {actionLoading === card.id ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Snowflake className="h-3.5 w-3.5 mr-1" />
                      )}
                      {card.status === "frozen" ? "Unfreeze" : "Freeze"}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-lg"
                      disabled={actionLoading === card.id}
                      onClick={() => handleShowPIN(card)}
                    >
                      {actionLoading === card.id ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Lock className="h-3.5 w-3.5 mr-1" />
                      )}
                      PIN
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="rounded-lg text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Card?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete your {card.type.toLowerCase()} card ending in {card.last4}. 
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDeleteCard(card.id)}
                            disabled={actionLoading === card.id}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {actionLoading === card.id ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : null}
                            Delete Card
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* PIN Dialog */}
      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent className="sm:max-w-[350px]">
          <DialogHeader>
            <DialogTitle>Card PIN</DialogTitle>
            <DialogDescription>
              {selectedCard && `Your ${selectedCard.type.toLowerCase()} card ending in ${selectedCard.last4}`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <div className="text-center">
              <div className="text-4xl font-mono font-bold tracking-widest mb-4">
                {selectedCard?.pin}
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Never share your PIN with anyone. Vura will never ask for your PIN.
              </p>
              <Button 
                variant="outline" 
                onClick={copyPIN}
                className="w-full"
              >
                {copiedPin ? <CheckCircle className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copiedPin ? "Copied!" : "Copy PIN"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Cards;
