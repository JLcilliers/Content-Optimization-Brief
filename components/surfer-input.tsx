"use client"

import { useState } from "react"
import { FileSearch, Loader2, CheckCircle, AlertCircle, ExternalLink, Plus, X, ChevronDown, ChevronUp } from "lucide-react"
import type { KeywordData, SurferSEOReport } from "@/types"

interface ImportedReport {
  id: string
  url: string
  targetKeyword: string
  keywordCount: number
  questionCount: number
  keywords: KeywordData
  surferReport: SurferSEOReport
}

interface SurferInputProps {
  onDataLoaded: (keywords: KeywordData, surferReport: SurferSEOReport) => void
  disabled?: boolean
}

export function SurferInput({ onDataLoaded, disabled }: SurferInputProps) {
  const [surferUrl, setSurferUrl] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [importedReports, setImportedReports] = useState<ImportedReport[]>([])
  const [isExpanded, setIsExpanded] = useState(true)

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

    // Check if already imported
    if (importedReports.some(r => r.url === surferUrl.trim())) {
      setError("This report has already been imported")
      return
    }

    setIsLoading(true)
    setError("")

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

      const newReport: ImportedReport = {
        id: Date.now().toString(),
        url: surferUrl.trim(),
        targetKeyword: surferReport.targetKeyword || "Not detected",
        keywordCount: keywords.all.length,
        questionCount: keywords.questions.length,
        keywords,
        surferReport,
      }

      const updatedReports = [...importedReports, newReport]
      setImportedReports(updatedReports)
      setSurferUrl("")

      // Merge all keywords from all reports
      const mergedKeywords = mergeAllKeywords(updatedReports)
      onDataLoaded(mergedKeywords, surferReport)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch report"
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemoveReport = (reportId: string) => {
    const updatedReports = importedReports.filter(r => r.id !== reportId)
    setImportedReports(updatedReports)

    if (updatedReports.length > 0) {
      const mergedKeywords = mergeAllKeywords(updatedReports)
      onDataLoaded(mergedKeywords, updatedReports[0].surferReport)
    }
  }

  const mergeAllKeywords = (reports: ImportedReport[]): KeywordData => {
    const merged: KeywordData = {
      primary: [],
      secondary: [],
      nlpTerms: [],
      questions: [],
      longTail: [],
      all: [],
    }

    reports.forEach(report => {
      merged.primary = [...new Set([...merged.primary, ...report.keywords.primary])]
      merged.secondary = [...new Set([...merged.secondary, ...report.keywords.secondary])]
      merged.nlpTerms = [...new Set([...merged.nlpTerms, ...report.keywords.nlpTerms])]
      merged.questions = [...new Set([...merged.questions, ...report.keywords.questions])]
      merged.longTail = [...new Set([...merged.longTail, ...report.keywords.longTail])]
      merged.all = [...new Set([...merged.all, ...report.keywords.all])]
    })

    return merged
  }

  const totalKeywords = importedReports.reduce((sum, r) => sum + r.keywordCount, 0)
  const totalQuestions = importedReports.reduce((sum, r) => sum + r.questionCount, 0)

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileSearch className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">SurferSEO Reports</h3>
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Optional</span>
          {importedReports.length > 0 && (
            <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded-full">
              {importedReports.length} report{importedReports.length !== 1 ? 's' : ''} imported
            </span>
          )}
        </div>
        {importedReports.length > 0 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>

      {isExpanded && (
        <>
          <p className="text-sm text-muted-foreground mb-4">
            Import multiple SurferSEO Content Editor reports to combine keywords from different target terms.
          </p>

          <div className="space-y-3">
            {/* Input for new report */}
            <div className="flex gap-2">
              <input
                type="url"
                value={surferUrl}
                onChange={(e) => {
                  setSurferUrl(e.target.value)
                  setError("")
                }}
                placeholder="https://app.surferseo.com/content-editor/..."
                className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={disabled || isLoading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && surferUrl.trim() && !isLoading) {
                    handleFetchReport()
                  }
                }}
              />
              <button
                onClick={handleFetchReport}
                disabled={disabled || isLoading || !surferUrl.trim()}
                className="inline-flex items-center justify-center h-10 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 transition-colors"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Report
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

            {/* List of imported reports */}
            {importedReports.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Imported Reports
                </div>
                {importedReports.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between p-3 rounded-md bg-success/10 border border-success/20"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <CheckCircle className="h-4 w-4 text-success flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate" title={report.targetKeyword}>
                          {report.targetKeyword}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {report.keywordCount} keywords • {report.questionCount} questions
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveReport(report.id)}
                      disabled={disabled}
                      className="p-1 hover:bg-destructive/10 rounded transition-colors text-muted-foreground hover:text-destructive disabled:opacity-50"
                      title="Remove report"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                {/* Summary */}
                {importedReports.length > 1 && (
                  <div className="mt-3 p-3 rounded-md bg-primary/5 border border-primary/20">
                    <p className="text-sm font-medium text-primary">Combined Data</p>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Reports</p>
                        <p className="font-medium">{importedReports.length}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total Keywords</p>
                        <p className="font-medium">{totalKeywords}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total Questions</p>
                        <p className="font-medium">{totalQuestions}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Note: SurferSEO reports must be publicly accessible or shared. Keywords from all reports will be combined for optimization.
            </p>
          </div>
        </>
      )}

      {/* Collapsed summary */}
      {!isExpanded && importedReports.length > 0 && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{importedReports.length} report{importedReports.length !== 1 ? 's' : ''}</span>
          <span>•</span>
          <span>{totalKeywords} keywords</span>
          <span>•</span>
          <span>{totalQuestions} questions</span>
        </div>
      )}
    </div>
  )
}
