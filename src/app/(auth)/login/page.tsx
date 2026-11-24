import Image from "next/image";
import { Suspense } from "react";
import { BrandFrame } from "@/components/auth/BrandFrame";
import { LoginCarousel } from "@/components/marketing/LoginCarousel";
import { LoginView } from "./LoginView";

export const metadata = { title: "Sign in | tok∑ner" };

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full bg-surface flex">
      <BrandFrame><LoginCarousel /></BrandFrame>

      {/* Right: sign-in card */}
      <div className="flex-1 min-w-0 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden mb-10 flex justify-center">
            <Image src="/brand/logo-light.svg" alt="tok∑ner" width={152} height={48} priority />
          </div>
          <Suspense fallback={null}><LoginView /></Suspense>
        </div>
      </div>
    </div>
  );
}
