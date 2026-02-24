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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

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

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const linkClass = "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200";

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
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
  );
};

export default AppSidebar;
