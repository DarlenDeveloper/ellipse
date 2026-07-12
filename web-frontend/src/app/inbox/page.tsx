"use client";

import { useState } from "react";
import { InboxTopBar } from "@/components/inbox/InboxTopBar";
import { MessageList } from "@/components/inbox/MessageList";
import { ReadingPane } from "@/components/inbox/ReadingPane";

export default function InboxPage() {
  const [selectedId, setSelectedId] = useState("2");

  return (
    <div className="flex flex-col h-screen">
      <InboxTopBar />
      <div className="flex flex-1 min-h-0">
        <MessageList selectedId={selectedId} onSelect={setSelectedId} />
        <ReadingPane selectedId={selectedId} />
      </div>
    </div>
  );
}
