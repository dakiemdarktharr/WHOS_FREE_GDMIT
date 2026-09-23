import { PlanRoomClient } from "@/components/PlanRoomClient";

export default async function RoomPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  return <PlanRoomClient code={roomCode} />;
}
