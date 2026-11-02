export function getTFOptions(language: string): [string, string] {
    switch (language) {
      case "Hindi":
        return ["सत्य", "असत्य"];
      case "Bangla":
        return ["সত্য", "মিথ্যা"];
      case "French":
        return ["Vrai", "Faux"];
      default:
        return ["True", "False"];
    }
  }