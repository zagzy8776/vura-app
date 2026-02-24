import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";
import BalanceCard from "@/components/BalanceCard";
import QuickActions from "@/components/QuickActions";
import StatsCards from "@/components/StatsCards";
import TransactionList from "@/components/TransactionList";
import SpendingChart from "@/components/SpendingChart";

const Index = () => {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 ml-64 px-8 pb-8">
        <DashboardHeader />
        
        <div className="grid grid-cols-12 gap-6">
          {/* Left column */}
          <div className="col-span-8 space-y-6">
            <BalanceCard />
            <StatsCards />
            <SpendingChart />
          </div>

          {/* Right column */}
          <div className="col-span-4 space-y-6">
            <QuickActions />
            <TransactionList />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
