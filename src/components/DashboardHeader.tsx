import { Bell, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const DashboardHeader = () => {
  const { user } = useAuth();
  
  // Get initials from vuraTag
  const getInitials = (tag: string) => {
    return tag.slice(0, 2).toUpperCase();
  };

  return (
    <header className="flex items-center justify-between py-4 sm:py-6 pl-14 lg:pl-0 safe-area-top">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg sm:text-2xl font-bold text-foreground truncate">
          Welcome back, {user ? `@${user.vuraTag}` : "Guest"} 👋
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 hidden sm:block">Here's what's happening with your finances</p>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 ml-2 shrink-0">
        <button className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl bg-card border border-border shadow-card transition-colors hover:bg-secondary">
          <Search className="h-4.5 w-4.5 text-muted-foreground" />
        </button>
        <button className="relative flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-card border border-border shadow-card transition-colors hover:bg-secondary">
          <Bell className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-muted-foreground" />
          <span className="absolute right-1.5 top-1.5 sm:right-2 sm:top-2 h-2 w-2 rounded-full bg-primary" />
        </button>
        <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl gradient-brand text-primary-foreground font-semibold text-xs sm:text-sm">
          {user ? getInitials(user.vuraTag) : "??"}
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
