import NegotiationClient from "@/components/negotiation/NegotiationClient";
import "./negotiation.css";

export const metadata = {
  title: "Live negotiation room, want-it",
};

export default function NegotiationPage() {
  return <NegotiationClient />;
}
