import { motion } from "framer-motion";
import { User, Shield, Bell, Smartphone, Globe, Moon, ChevronRight, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppSidebar from "@/components/AppSidebar";
import DashboardHeader from "@/components/DashboardHeader";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

const settingSections = [
  {
    title: "Account",
    items: [
      { icon: User, label: "Personal Information", desc: "Name, email, phone number" },
      { icon: Shield, label: "Security", desc: "Password, 2FA, biometrics" },
      { icon: Smartphone, label: "Linked Devices", desc: "Manage trusted devices" },
    ],
  },
  {
    title: "Preferences",
    items: [
      { icon: Bell, label: "Notifications", desc: "Push, email, SMS alerts" },
      { icon: Globe, label: "Language & Region", desc: "English, Nigeria" },
      { icon: Moon, label: "Appearance", desc: "Light mode" },
    ],
  },
];

const Settings = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 ml-64 px-8 pb-8">
        <DashboardHeader />
        <div className="max-w-2xl">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-foreground">Settings</h2>
            <p className="text-muted-foreground text-sm mt-1">Manage your account preferences</p>
          </div>

          {/* Profile Card */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-card border border-border p-6 shadow-card mb-6 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-brand text-primary-foreground font-bold text-lg">
              AO
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">Adaeze Okafor</p>
              <p className="text-sm text-muted-foreground">@adaeze · Tier 2</p>
            </div>
            <Button variant="outline" className="rounded-xl">Edit Profile</Button>
          </motion.div>

          {/* Setting Sections */}
          {settingSections.map((section, si) => (
            <motion.div key={section.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: si * 0.1 }}>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 mt-6">{section.title}</h3>
              <div className="rounded-2xl bg-card border border-border shadow-card overflow-hidden divide-y divide-border">
                {section.items.map((item) => (
                  <button key={item.label} className="flex w-full items-center gap-4 p-4 hover:bg-secondary/50 transition-colors text-left">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </motion.div>
          ))}

          {/* Logout */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <Button onClick={handleLogout} variant="outline" className="w-full mt-8 h-12 rounded-xl text-destructive hover:text-destructive border-destructive/20 hover:bg-destructive/5">
              <LogOut className="h-4 w-4 mr-2" /> Log Out
            </Button>
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default Settings;
