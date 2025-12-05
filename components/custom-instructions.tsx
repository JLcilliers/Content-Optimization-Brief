"use client"

import { useState } from "react"
import { Settings2, ChevronDown, ChevronUp } from "lucide-react"
import type { CustomInstructions } from "@/types"

interface CustomInstructionsProps {
  value: CustomInstructions
  onChange: (instructions: CustomInstructions) => void
  disabled?: boolean
}

export function CustomInstructionsInput({ value, onChange, disabled }: CustomInstructionsProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const hasContent = value.thingsToAvoid || value.focusAreas || value.toneAndStyle || value.additionalInstructions

  const handleChange = (field: keyof CustomInstructions, newValue: string) => {
    onChange({
      ...value,
      [field]: newValue,
    })
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Custom Instructions</h3>
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Optional</span>
          {hasContent && (
            <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded-full">
              Instructions added
            </span>
          )}
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {!isExpanded && hasContent && (
        <div className="text-sm text-muted-foreground">
          {[
            value.thingsToAvoid && "Things to Avoid",
            value.focusAreas && "Focus Areas",
            value.toneAndStyle && "Tone & Style",
            value.additionalInstructions && "Additional Instructions",
          ].filter(Boolean).join(" • ")}
        </div>
      )}

      {isExpanded && (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            Provide specific guidance to customize how the AI optimizes your content.
          </p>

          <div className="space-y-4">
            {/* Things to Avoid */}
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Things to Avoid
              </label>
              <textarea
                value={value.thingsToAvoid}
                onChange={(e) => handleChange("thingsToAvoid", e.target.value)}
                placeholder="Content, phrases, topics, or words the AI should NOT include or should remove..."
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Example: competitor names, specific claims, outdated terminology
              </p>
            </div>

            {/* Focus Areas */}
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Focus Areas
              </label>
              <textarea
                value={value.focusAreas}
                onChange={(e) => handleChange("focusAreas", e.target.value)}
                placeholder="What to emphasize, prioritize, or highlight in the content..."
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Example: key benefits, unique selling points, specific services
              </p>
            </div>

            {/* Tone & Style */}
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Tone & Style Notes
              </label>
              <textarea
                value={value.toneAndStyle}
                onChange={(e) => handleChange("toneAndStyle", e.target.value)}
                placeholder="Brand voice, writing style, formality level..."
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Example: professional but approachable, avoid jargon, use active voice
              </p>
            </div>

            {/* Additional Instructions */}
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Additional Instructions
              </label>
              <textarea
                value={value.additionalInstructions}
                onChange={(e) => handleChange("additionalInstructions", e.target.value)}
                placeholder="Any other guidance for the optimization..."
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Example: target audience details, industry context, compliance requirements
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            Note: These instructions guide the AI but do not override core optimization rules (content preservation, grammatical accuracy).
          </p>
        </>
      )}
    </div>
  )
}
