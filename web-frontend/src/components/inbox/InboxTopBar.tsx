"use client";

import { SearchNormal1, Setting4, Moon, Setting2, Notification } from "iconsax-react";

export function InboxTopBar() {
  return (
    <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 bg-white">
      {/* Search */}
      <div className="flex-1 max-w-xl relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
          <SearchNormal1 size={18} variant="Linear" />
        </span>
        <input
          type="text"
          placeholder="Search mail"
          className="w-full bg-gray-100 rounded-full pl-11 pr-11 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
          <Setting4 size={18} variant="Linear" />
        </span>
      </div>

      {/* Right icons */}
      <div className="flex items-center gap-1 ml-auto">
        {[Moon, Setting2, Notification].map((Icon, i) => (
          <button
            key={i}
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
          >
            <Icon size={18} variant="Linear" />
          </button>
        ))}
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-300 to-purple-500 ml-1" />
      </div>
    </div>
  );
}
