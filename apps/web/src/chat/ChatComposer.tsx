import React from "react"
import { SlashMenu } from "./SlashMenu"

export const ChatComposer: React.FC = () => (
  <div className="relative mx-auto w-[min(840px,calc(100%-40px))] max-[820px]:w-[calc(100%-20px)]">
    <SlashMenu />
    <div className="rounded-[9px] border border-[#303845] bg-[#0a0d12] shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
      <textarea
        aria-label="Chat message"
        disabled
        rows={1}
        placeholder="Ask the agent, or type / for commands…"
        className="block max-h-[130px] w-full resize-none border-0 bg-transparent px-3.5 pt-3.5 pb-[5px] text-base leading-normal text-body outline-0 placeholder:text-[#4d5663] disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="flex h-[37px] items-center justify-between px-2 pb-1.5 pl-[11px]">
        <div className="flex items-center gap-2.5 text-2xs text-[#4f5865]">
          <button
            type="button"
            disabled
            aria-label="Add attachment"
            className="grid size-[23px] cursor-not-allowed place-items-center rounded-[5px] border border-line bg-[#12161b] text-[#737d89] opacity-50"
          >
            ＋
          </button>
          <span>
            <kbd className="rounded-[3px] border border-[#2e3540] bg-[#151920] px-[3px] py-px font-mono text-2xs text-[#77818e]">
              ⌘
            </kbd>{" "}
            <kbd className="rounded-[3px] border border-[#2e3540] bg-[#151920] px-[3px] py-px font-mono text-2xs text-[#77818e]">
              ↵
            </kbd>{" "}
            to send
          </span>
        </div>
        <button
          type="button"
          aria-label="Send message"
          disabled
          className="grid size-[27px] cursor-not-allowed place-items-center rounded-md border-0 bg-lime text-sm font-bold text-lime-ink opacity-50"
        >
          ↑
        </button>
      </div>
    </div>
    <div className="flex h-[30px] items-center justify-between font-mono text-2xs text-[#414a56]">
      <span>ACP v0.8</span>
      <span>Prompts run locally on this machine</span>
    </div>
  </div>
)
