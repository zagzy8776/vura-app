import { motion } from "framer-motion";
import { CreditCard, Plus, Lock, Eye, EyeOff, Snowflake, Trash2, Copy, CheckCircle, CreditCard as CardIcon, AlertTriangle, Shield } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

interface CardData {
  id: number;
  type: "Virtual" | "Physical";
  last4: string;
  expiry: string;
  balance: string;
  color: string;
  status: "active" | "frozen";
  cardNumber: string;
  cvv: string;
  pin: string;
  createdAt: string;
}

const generateCardNumber = () => {
  return "•••• •••• •••• " + Math.floor(1000 + Math.random() * 9000);
};

const generateLast4 = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

const generateExpiry = () => {
  const month = Math.floor(1 + Math.random() * 12).toString().padStart(2, "0");
  const year = (new Date().getFullYear() + Math.floor(2 + Math.random() * 3)).toString().slice(-2);
  return `${month}/${year}`;
};

const generateCVV = () => {
  return Math.floor(100 + Math.random() * 900).toString();
};

const generatePIN = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

const Cards = () => {
  const { user } = useAuth();
  const [cards, setCards] = useState<CardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState<Record<number, boolean>>({});
  const [newCardOpen, setNewCardOpen] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [newCardType, setNewCardType] = useState<"Virtual" | "Physical">("Virtual");
  const [copiedPin, setCopiedPin] = useState(false);
  const [kycDialogOpen, setKycDialogOpen] = useState(false);

  // Check if user is KYC verified (tier 2+ required for cards)
  const isKycVerified = user?.kycTier && user.kycTier >= 2;

  // Load cards from localStorage on mount
  useEffect(() => {
    const loadCards = () => {
      setLoading(true);
      const userId = user?.id || "guest";
      const stored = localStorage.getItem(`vura_cards_${userId}`);
      
      if (stored) {
        setCards(JSON.parse(stored));
      } else {
        // Initialize with demo cards for first-time users
        const demoCards: CardData[] = [
          {
            id: Date.now(),
            type: "Virtual",
            last4: generateLast4(),
            expiry: generateExpiry(),
            balance: "₦0.00",
            color: "gradient-card",
            status: "active",
            cardNumber: generateCardNumber(),
            cvv: generateCVV(),
            pin: generatePIN(),
            createdAt: new Date().toISOString(),
          },
        ];
        setCards(demoCards);
        localStorage.setItem(`vura_cards_${userId}`, JSON.stringify(demoCards));
      }
      setLoading(false);
    };

    loadCards();
  }, [user?.id]);

  // Save cards to localStorage whenever they change
  useEffect(() => {
    if (!loading && user?.id) {
      localStorage.setItem(`vura_cards_${user?.id || "guest"}`, JSON.stringify(cards));
    }
  }, [cards, loading, user?.id]);

  const toggleDetails = (id: number) => {
    setShowDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleNewCardClick = () => {
    if (!isKycVerified) {
      setKycDialogOpen(true);
      return;
    }
    setNewCardOpen(true);
  };

  const handleCreateCard = () => {
    const newCard: CardData = {
      id: Date.now(),
      type: newCardType,
      last4: generateLast4(),
      expiry: generateExpiry(),
      balance: "₦0.00",
      color: newCardType === "Virtual" ? "gradient-card" : "gradient-brand",
      status: "active",
      cardNumber: generateCardNumber(),
      cvv: generateCVV(),
      pin: generatePIN(),
      createdAt: new Date().toISOString(),
    };

    setCards((prev) => [...prev, newCard]);
    setNewCardOpen(false);
    toast({
      title: "Card Created!",
      description: `Your new ${newCardType.toLowerCase()} card ending in ${newCard.last4} is ready to use.`,
    });
  };

  const handleFreezeCard = (cardId: number) => {
    setCards((prev) =>
      prev.map((card) => {
        if (card.id === cardId) {
          const newStatus = card.status === "active" ? "frozen" : "active";
          toast({
            title: newStatus === "frozen" ? "Card Frozen" : "Card Unfrozen",
            description: `Your card ending in ${card.last4} has been ${newStatus === "frozen" ? "frozen" : "unfrozen"}.`,
          });
          return { ...card, status: newStatus };
        }
        return card;
      })
    );
  };

  const handleDeleteCard = (cardId: number) => {
    const card = cards.find((c) => c.id === cardId);
    setCards((prev) => prev.filter((c) => c.id !== cardId));
    toast({
      title: "Card Deleted",
      description: `Your ${card?.type.toLowerCase()} card ending in ${card?.last4} has been deleted.`,
      variant: "destructive",
    });
  };

  const handleShowPIN = (card: CardData) => {
    setSelectedCard(card);
    setPinDialogOpen(true);
    setCopiedPin(false);
  };

  const copyPIN = () => {
    if (selectedCard) {
      navigator.clipboard.writeText(selectedCard.pin);
      setCopiedPin(true);
      toast({
        title: "PIN Copied!",
        description: "Your card PIN has been copied to clipboard.",
      });
      setTimeout(() => setCopiedPin(false), 2000);
    }
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
                      // Navigate to KYC/Settings page
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
                  <Button onClick={handleCreateCard} className="gradient-brand text-primary-foreground">
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
                        <p className="text-lg font-bold">{showDetails[card.id] ? card.balance : "₦•••••••"}</p>
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
                      onClick={() => handleFreezeCard(card.id)}
                    >
                      <Snowflake className="h-3.5 w-3.5 mr-1" /> 
                      {card.status === "frozen" ? "Unfreeze" : "Freeze"}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="rounded-lg"
                      onClick={() => handleShowPIN(card)}
                    >
                      <Lock className="h-3.5 w-3.5 mr-1" /> PIN
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
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
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
