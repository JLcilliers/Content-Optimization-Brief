"use client"

import { useState } from "react"
import { FileSearch, Loader2, CheckCircle, AlertCircle, ExternalLink } from "lucide-react"
import type { KeywordData, SurferSEOReport } from "@/types"

interface SurferInputProps {
  onDataLoaded: (keywords: KeywordData, surferReport: SurferSEOReport) => void
  disabled?: boolean
}

export function SurferInput({ onDataLoaded, disabled }: SurferInputProps) {
  const [surferUrl, setSurferUrl] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [reportSummary, setReportSummary] = useState<{
    targetKeyword: string
    keywordCount: number
    questionCount: number
  } | null>(null)

  const handleFetchReport = async () => {
    if (!surferUrl.trim()) {
      setError("Please enter a SurferSEO report URL")
      return
    }

    // Validate URL format
    if (!surferUrl.includes("surferseo.com")) {
      setError("Please enter a valid SurferSEO URL (e.g., https://app.surferseo.com/...)")
      return
    }

    setIsLoading(true)
    setError("")
    setSuccess(false)
    setReportSummary(null)

    try {
      const response = await fetch("/api/surfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surferUrl }),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch SurferSEO report")
      }

      const { keywords, surferReport } = data.data

      setSuccess(true)
      setReportSummary({
        targetKeyword: surferReport.targetKeyword || "Not detected",
        keywordCount: keywords.all.length,
        questionCount: keywords.questions.length,
      })

      onDataLoaded(keywords, surferReport)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch report"
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <FileSearch className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">SurferSEO Report Import</h3>
        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Optional</span>
      </div>

      <p className="text-sm text-muted-foreground mb-4">
        Paste a SurferSEO Content Editor report link to automatically import keywords, NLP terms, and recommendations.
      </p>

      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            type="url"
            value={surferUrl}
            onChange={(e) => {
              setSurferUrl(e.target.value)
              setError("")
              setSuccess(false)
            }}
            placeholder="https://app.surferseo.com/content-editor/..."
            className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled || isLoading}
          />
          <button
            onClick={handleFetchReport}
            disabled={disabled || isLoading || !surferUrl.trim()}
            className="inline-flex items-center justify-center h-10 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Fetching...
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4 mr-2" />
                Import
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Import Failed</p>
              <p className="text-xs mt-1 opacity-90">{error}</p>
            </div>
          </div>
        )}

        {success && reportSummary && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-success/10 text-success text-sm">
            <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">SurferSEO Data Imported!</p>
              <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                <div className="bg-background/50 rounded p-2">
                  <p className="text-muted-foreground">Target Keyword</p>
                  <p className="font-medium truncate" title={reportSummary.targetKeyword}>
                    {reportSummary.targetKeyword}
                  </p>
                </div>
                <div className="bg-background/50 rounded p-2">
                  <p className="text-muted-foreground">Keywords</p>
                  <p className="font-medium">{reportSummary.keywordCount}</p>
                </div>
                <div className="bg-background/50 rounded p-2">
                  <p className="text-muted-foreground">Questions</p>
                  <p className="font-medium">{reportSummary.questionCount}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Note: The SurferSEO report must be publicly accessible or shared. Make sure you have permission to use the report data.
        </p>
      </div>
    </div>
  )
}
