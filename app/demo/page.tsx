import type { Metadata } from "next";
import DemoClient from "@/components/demo/DemoClient";

export const metadata: Metadata = {
  title: "Behind the scenes — want-it",
  description: "What the buyer never sees: orders arrive, the marketplace groups them, and agents negotiate the group price.",
};

export default function DemoPage() {
  return <DemoClient />;
}
