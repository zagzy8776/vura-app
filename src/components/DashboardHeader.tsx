import { Bell, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const DashboardHeader = () => {
  const { user } = useAuth();
  
  // Get initials from vuraTag
  const getInitials = (tag: string) => {
    return tag.slice(0, 2).toUpperCase();
  };

  return (
    <header className="flex items-center justify-between py-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {user ? `@${user.vuraTag}` : "Guest"} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Here's what's happening with your finances</p>
      </div>
      <div className="flex items-center gap-3">
        <button className="flex h-10 w-10 items-center justify-center rounded-xl bg-card border border-border shadow-card transition-colors hover:bg-secondary">
          <Search className="h-4.5 w-4.5 text-muted-foreground" />
        </button>
        <button className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-card border border-border shadow-card transition-colors hover:bg-secondary">
          <Bell className="h-4.5 w-4.5 text-muted-foreground" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
        </button>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-brand text-primary-foreground font-semibold text-sm">
          {user ? getInitials(user.vuraTag) : "??"}
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
