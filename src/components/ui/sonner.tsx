import { useAppPreferences } from "@/lib/appPreferences";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useAppPreferences();

  return (
    <Sonner
      theme={resolvedTheme as ToasterProps["theme"]}
      className="toaster group"
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-2xl group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:bg-popover/95 group-[.toaster]:text-popover-foreground group-[.toaster]:shadow-soft-lg group-[.toaster]: group-[.toaster]:px-4 group-[.toaster]:py-3 group-[.toaster]:text-footnote group-[.toaster]:font-medium",
          title: "group-[.toast]:font-semibold group-[.toast]:tracking-tight",
          description: "group-[.toast]:text-caption group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:!rounded-full group-[.toast]:!bg-primary group-[.toast]:!px-3 group-[.toast]:!text-caption group-[.toast]:!font-semibold group-[.toast]:!text-primary-foreground",
          cancelButton:
            "group-[.toast]:!rounded-full group-[.toast]:!bg-muted group-[.toast]:!px-3 group-[.toast]:!text-caption group-[.toast]:!text-muted-foreground",
          icon: "group-[.toast]:text-primary",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
