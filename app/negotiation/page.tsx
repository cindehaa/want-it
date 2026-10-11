import NegotiationClient from "@/components/negotiation/NegotiationClient";
import "./negotiation.css";
import "./stage.css";

export const metadata = {
  title: "Behind the scenes: our agents negotiate — want-it",
};

export default function NegotiationPage() {
  return <NegotiationClient />;
}
