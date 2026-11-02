import React, { useState, useEffect } from "react";
import { ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

const BackToTop = ({ loading = false }: { loading?: boolean }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.pageYOffset > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener("scroll", toggleVisibility);
    return () => window.removeEventListener("scroll", toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  return (
    <>
      {isVisible && !loading && (
        <div className="fixed bottom-8 right-8 z-50 flex flex-col items-center gap-2">
          <Button
            onClick={scrollToTop}
            className="w-12 h-12 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 bg-blue-600 hover:bg-blue-700"
            size="icon"
            aria-label="Back to top"
          >
            <ChevronUp className="w-6 h-6" />
          </Button>
          <span className="text-xs font-medium text-gray-600 bg-white/80 px-2 py-1 rounded shadow">
            Scroll to top
          </span>
        </div>
      )}
    </>
  );
};

export default BackToTop;
