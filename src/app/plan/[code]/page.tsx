import { PlanRoomClient } from "@/components/PlanRoomClient";

export default async function PlanPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PlanRoomClient code={code.toUpperCase()} />;
}
