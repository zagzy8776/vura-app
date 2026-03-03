import { 
  LayoutDashboard, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CreditCard, 
  History, 
  Settings, 
  HelpCircle, 
  LogOut,
  Wallet,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", to: "/" },
  { icon: ArrowUpRight, label: "Send Money", to: "/send" },
  { icon: ArrowDownLeft, label: "Receive", to: "/receive" },
  { icon: CreditCard, label: "Cards", to: "/cards" },
  { icon: History, label: "Transactions", to: "/transactions" },
  { icon: Wallet, label: "Accounts", to: "/accounts" },
];

const bottomItems = [
  { icon: Settings, label: "Settings", to: "/settings" },
  { icon: HelpCircle, label: "Help", to: "/help" },
];

const AppSidebar = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const linkClass = "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200";

  const closeMobileMenu = () => {
    setIsMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-3 left-3 sm:top-4 z-50 flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-card border border-border shadow-card hover:bg-secondary transition-colors safe-area-left"
      >
        {isMobileOpen ? <X className="h-5 w-5 sm:h-6 sm:w-6" /> : <Menu className="h-5 w-5 sm:h-6 sm:w-6" />}
      </button>

      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed left-0 top-0 z-50 flex h-screen w-64 sm:w-72 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-transform duration-300 ease-in-out",
        isMobile ? (isMobileOpen ? "translate-x-0" : "-translate-x-full") : "translate-x-0"
      )}>
        {/* Logo */}
        <div className="flex items-center gap-2 px-6 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-brand">
            <span className="text-lg font-bold text-primary-foreground">V</span>
          </div>
          <span className="text-xl font-bold text-sidebar-accent-foreground tracking-tight">Vura</span>
        </div>

        {/* Main nav */}
        <nav className="flex-1 space-y-1 px-3 mt-2">
          {navItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              className={cn(linkClass, "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}
              activeClassName="bg-sidebar-accent text-sidebar-primary"
              end={item.to === "/"}
              onClick={closeMobileMenu}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom nav */}
        <div className="space-y-1 px-3 pb-4">
          {bottomItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              className={cn(linkClass, "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}
              activeClassName="bg-sidebar-accent text-sidebar-primary"
              onClick={closeMobileMenu}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
          <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive transition-all hover:bg-sidebar-accent">
            <LogOut className="h-5 w-5" />
            Log Out
          </button>
        </div>
      </aside>
    </>
  );
};

export default AppSidebar;
