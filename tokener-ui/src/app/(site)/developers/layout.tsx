import { DevNav } from "@/components/site/DevNav";

export default function DevelopersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DevNav />
      {children}
    </>
  );
}
