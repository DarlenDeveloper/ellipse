"use client";

import { useState } from "react";
import { SearchNormal1 } from "iconsax-react";
import { integrations as seed } from "@/components/integrations/data";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";

export default function IntegrationsPage() {
  const [items, setItems] = useState(seed);
  const [query, setQuery] = useState("");

  const toggle = (id: string) =>
    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, connected: !it.connected } : it
      )
    );

  const filtered = items.filter((it) =>
    it.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <main className="p-8 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Integrations &amp; workflows
          </h1>
          <p className="text-gray-400 mt-2">
            Supercharge your workflow and connect the tools you and your team use
            every day.
          </p>
        </div>
        <div className="relative w-64 shrink-0">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
            <SearchNormal1 size={18} variant="Linear" />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full bg-white border border-gray-200 rounded-full pl-11 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-200"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map((integration) => (
          <IntegrationCard
            key={integration.id}
            integration={integration}
            onToggle={toggle}
          />
        ))}
      </div>
    </main>
  );
}
