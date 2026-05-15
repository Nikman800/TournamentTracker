import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export function Navigation() {
  const [location] = useLocation();
  
  // Don't show nav on auth page
  if (location === "/auth") {
    return null;
  }

  return (
    <nav className="border-b bg-gamba-navy text-white sticky top-0 z-50 shadow-gamba">
      <div className="container mx-auto px-6 py-3">
        <div className="flex items-center justify-between">
          <Link href="/">
            <span className="font-silkscreen text-xl font-bold text-gamba-yellow tracking-wide cursor-pointer">
              GambaGame
            </span>
          </Link>
          <Link href="/">
            <Button variant="ghost" size="sm" className="flex items-center gap-2 text-white hover:text-gamba-yellow hover:bg-transparent">
              <Home className="h-4 w-4" />
              Home
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}

