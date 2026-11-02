import { cn } from "@/lib/utils"

interface LoaderProps {
  className?: string
  size?: "sm" | "md" | "lg"
  text?: string
}

export function Loader({ className, size = "md", text }: LoaderProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8", 
    lg: "h-12 w-12"
  }

  return (
    <div className={cn("flex flex-col items-center justify-center space-y-4", className)}>
      <div className="relative">
        <div className={cn(
          "animate-spin rounded-full border-4 border-muted border-t-primary",
          sizeClasses[size]
        )} />
        <div className={cn(
          "absolute inset-0 animate-pulse rounded-full bg-primary/20",
          sizeClasses[size]
        )} />
      </div>
      {text && (
        <p className="text-sm text-muted-foreground font-medium animate-pulse">
          {text}
        </p>
      )}
    </div>
  )
}

export function PageLoader({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-card rounded-lg shadow-lg p-8 border">
        <Loader size="lg" text={text} />
      </div>
    </div>
  )
}
