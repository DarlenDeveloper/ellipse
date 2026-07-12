"use client";

import {
  Archive,
  Trash,
  Star1,
  Flag,
  Clock,
  More,
  RotateLeft,
  Share,
} from "iconsax-react";
import { messages } from "./data";

export function ReadingPane({ selectedId }: { selectedId: string }) {
  const msg = messages.find((m) => m.id === selectedId) ?? messages[1];

  return (
    <div className="flex-1 flex flex-col bg-white min-w-0">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-6 py-4 border-b border-gray-100">
        {[Archive, Trash, Star1, Flag, Clock].map((Icon, i) => (
          <button
            key={i}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100"
          >
            <Icon size={18} variant="Linear" />
          </button>
        ))}
        <button className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 ml-1">
          <More size={18} variant="Linear" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <h1 className="text-2xl font-bold tracking-tight mb-6">
          {msg.subject}
        </h1>

        {/* Sender row */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${msg.avatarColor}`}
            >
              {msg.initial}
            </div>
            <div>
              <p className="text-sm">
                <span className="font-semibold">{msg.sender}</span>{" "}
                <span className="text-gray-400">&lt;{msg.email}&gt;</span>
              </p>
              <p className="text-xs text-gray-400 mt-0.5">to me, product-team</p>
            </div>
          </div>
          <span className="text-xs text-gray-400 shrink-0">
            {msg.time} (2 hours ago)
          </span>
        </div>

        {/* Body */}
        <div className="space-y-4 text-sm text-gray-700 leading-relaxed max-w-3xl">
          <p>Hi team,</p>
          <p>
            I&apos;ve just finished uploading the latest version of our UI kit.
            The primary focus for this sprint was aligning our component library
            with the new Material Design 3 guidelines, specifically regarding the
            Surface Container color tokens and elevation models.
          </p>

          {/* Key changes box */}
          <div className="border border-gray-200 rounded-2xl p-5 my-2">
            <p className="font-semibold text-gray-900 mb-3">Key Changes:</p>
            <ul className="space-y-2 list-disc pl-5">
              <li>Updated primary navigation to use tonal layering instead of drop shadows.</li>
              <li>Revised input field states (focus borders now use the primary accent).</li>
              <li>Added dark mode token mappings for all surface elevations.</li>
            </ul>
          </div>

          <p>
            Please take a look at the Figma file linked below and leave any
            feedback directly in the comments. We aim to finalize these updates
            before the next dev sprint starts on Monday.
          </p>
          <p>
            A few things I&apos;d specifically love eyes on: the new button
            hierarchy feels slightly off at smaller breakpoints the secondary
            button loses contrast on surface-variant backgrounds. Also, the
            spacing tokens for dense layouts (data tables, form rows) were updated
            from 4px base to 6px base, so if any of your screens use hardcoded
            spacing, those will need to be revisited.
          </p>
          <p>
            If you have any questions or need clarification on any of the changes,
            feel free to reply to this thread.
          </p>
          <p>
            Best regards,
            <br />
            {msg.sender.split(" ")[0]}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mt-8">
          <button className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-full px-6 py-2.5">
            <RotateLeft size={18} variant="Linear" color="#ffffff" />
            Reply
          </button>
          <button className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-full px-6 py-2.5">
            <Share size={18} variant="Linear" color="#ffffff" />
            Forward
          </button>
        </div>
      </div>
    </div>
  );
}
