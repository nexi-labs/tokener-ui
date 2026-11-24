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
          <main className="flex-1 px-5 sm:px-8 lg:px-12 py-6 sm:py-8 lg:py-10 max-w-[1480px] w-full mx-auto"><OperatorGate><PaymentGateProvider><SuspendedGate>{children}</SuspendedGate></PaymentGateProvider></OperatorGate></main>
        </div>
      </div>
    </ShellProvider>
    </ConsoleAuthGate>
  );
}
