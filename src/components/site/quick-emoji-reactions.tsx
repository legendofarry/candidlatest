import { AnimatePresence, motion } from "motion/react";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QUICK_EMOJIS } from "@/lib/composer-utils";

export function QuickEmojiReactions({
  open,
  onOpenChange,
  onSelect,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (emoji: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("relative shrink-0", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={open ? "Hide emoji reactions" : "Insert emoji"}
        aria-expanded={open}
        className={cn(
          "size-9 shrink-0 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary",
          open && "bg-primary/10 text-primary",
        )}
        onClick={() => onOpenChange(!open)}
      >
        <Smile className="size-[18px]" />
      </Button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute bottom-full left-0 z-40 mb-2 overflow-hidden rounded-full border border-border bg-popover p-1 text-popover-foreground shadow-xl"
          >
            <div
              role="group"
              aria-label="Quick emoji reactions"
              className="flex items-center gap-1"
            >
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={`Insert ${emoji}`}
                  onClick={() => onSelect(emoji)}
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary/80 text-lg transition-transform hover:scale-110 hover:bg-primary/10 active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
