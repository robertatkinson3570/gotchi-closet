import { cn } from "@/lib/utils";

interface SvgInlineProps {
  svg: string;
  className?: string;
  testId?: string;
}

export function SvgInline({ svg, className, testId = "gotchi-svg" }: SvgInlineProps) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "relative rounded-md bg-muted overflow-hidden flex items-center justify-center",
        className
      )}
    >
      <div
        data-testid={`${testId}-content`}
        className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}

