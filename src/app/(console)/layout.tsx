import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { OperatorGate } from "@/components/shell/OperatorGate";
import { ConsoleAuthGate } from "@/components/shell/ConsoleAuthGate";
import { PaymentGateProvider } from "@/components/billing/PaymentGate";
import { SuspendedGate } from "@/components/billing/SuspendedGate";
import { ShellProvider } from "@/components/shell/ShellContext";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConsoleAuthGate>
    <ShellProvider>
      <div className="flex min-h-screen bg-surface-subtle">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <TopBar />
          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-8 max-w-[1640px] w-full"><OperatorGate><PaymentGateProvider><SuspendedGate>{children}</SuspendedGate></PaymentGateProvider></OperatorGate></main>
        </div>
      </div>
    </ShellProvider>
    </ConsoleAuthGate>
  );
}
