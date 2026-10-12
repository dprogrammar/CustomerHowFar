import { Container } from "@/components/ui/container";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex-1 bg-surface py-8 sm:py-14">
      <Container>{children}</Container>
    </div>
  );
}
