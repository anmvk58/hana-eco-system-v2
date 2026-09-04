import { useEffect } from "react";

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title === "Hana POS" ? title : `${title} | Hana POS`;
    return () => {
      document.title = "Hana POS";
    };
  }, [title]);
}
