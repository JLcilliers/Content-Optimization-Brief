"use client"

import { useState, useCallback } from "react"
import { Header } from "@/components/header"
import { UrlInput } from "@/components/url-input"
import { KeywordUpload } from "@/components/keyword-upload"
import { SurferInput } from "@/components/surfer-input"
import { CustomInstructionsInput } from "@/components/custom-instructions"
import { AnalysisProgress } from "@/components/analysis-progress"
import { ResultsPreview } from "@/components/results-preview"
import { SettingsPanel } from "@/components/settings-panel"
import type { AnalysisResult, KeywordData, Settings, SurferSEOReport, CustomInstructions } from "@/types"
import { extractDomain } from "@/lib/utils"

interface ProgressStep {
  id: string
  label: string
  status: 'pending' | 'in_progress' | 'completed' | 'error'
}

const initialSteps: ProgressStep[] = [
  { id: 'crawl', label: 'Crawling page content', status: 'pending' },
  { id: 'meta', label: 'Extracting meta data', status: 'pending' },
  { id: 'headings', label: 'Analyzing heading structure', status: 'pending' },
  { id: 'schema', label: 'Detecting schema markup', status: 'pending' },
  { id: 'keywords', label: 'Processing keywords', status: 'pending' },
  { id: 'generate', label: 'Generating recommendations', status: 'pending' },
]

const defaultSettings: Settings = {
  brandName: '',
  titleMaxLength: 60,
  descriptionMaxLength: 160,
  tone: 'professional',
  includeSchemaRecommendations: true,
}

const defaultCustomInstructions: CustomInstructions = {
  thingsToAvoid: '',
  focusAreas: '',
  toneAndStyle: '',
  additionalInstructions: '',
}

export default function Home() {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false)
  const [keywords, setKeywords] = useState<KeywordData | null>(null)
  const [surferReport, setSurferReport] = useState<SurferSEOReport | null>(null)
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [customInstructions, setCustomInstructions] = useState<CustomInstructions>(defaultCustomInstructions)
  const [results, setResults] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState("")
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>(initialSteps)
  const [currentMessage, setCurrentMessage] = useState("")
  const [analyzedUrl, setAnalyzedUrl] = useState("")

  const updateStepStatus = (stepId: string, status: ProgressStep['status']) => {
    setProgressSteps(prev =>
      prev.map(step =>
        step.id === stepId ? { ...step, status } : step
      )
    )
  }

  const resetProgress = () => {
    setProgressSteps(initialSteps.map(step => ({ ...step, status: 'pending' })))
    setCurrentMessage("")
    setError("")
  }

  const handleAnalyze = useCallback(async (url: string) => {
    setIsAnalyzing(true)
    setResults(null)
    setError("")
    setAnalyzedUrl(url)
    resetProgress()

    try {
      // Simulate step progress for better UX
      const steps = ['crawl', 'meta', 'headings', 'schema', 'keywords', 'generate']

      // Start first step
      updateStepStatus('crawl', 'in_progress')
      setCurrentMessage('Connecting to page...')

      // Make the API call
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          keywords: keywords || {
            primary: [],
            secondary: [],
            nlpTerms: [],
            questions: [],
            longTail: [],
            all: [],
          },
          settings,
          customInstructions,
        }),
      })

      // Simulate progress updates
      for (let i = 0; i < steps.length; i++) {
        updateStepStatus(steps[i], 'completed')
        if (i < steps.length - 1) {
          updateStepStatus(steps[i + 1], 'in_progress')
          setCurrentMessage(getProgressMessage(steps[i + 1]))
        }
        // Small delay for visual feedback
        await new Promise(resolve => setTimeout(resolve, 300))
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Analysis failed')
      }

      setResults(data.data)
      setCurrentMessage('Analysis complete!')

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong'
      setError(errorMessage)
      // Mark current step as error
      setProgressSteps(prev =>
        prev.map(step =>
          step.status === 'in_progress' ? { ...step, status: 'error' } : step
        )
      )
    } finally {
      setIsAnalyzing(false)
    }
  }, [keywords, settings, customInstructions])

  const handleCancel = () => {
    setIsAnalyzing(false)
    resetProgress()
  }

  const handleDownload = async () => {
    if (!results) return

    setIsGeneratingDoc(true)

    // Create abort controller with 90 second timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 90000)

    try {
      // Extract client name and URL slug from URL
      const domain = extractDomain(analyzedUrl)
      const clientName = settings.brandName || domain.split('.')[0] || 'Client'

      // Extract URL slug for filename
      let urlSlug = 'homepage'
      try {
        const parsedUrl = new URL(analyzedUrl)
        const pathname = parsedUrl.pathname
        // Remove leading/trailing slashes and get the path
        const cleanPath = pathname.replace(/^\/+|\/+$/g, '')
        if (cleanPath) {
          // Replace remaining slashes with hyphens, convert to lowercase
          urlSlug = cleanPath.replace(/\//g, '-').toLowerCase()
        }
      } catch {
        // If URL parsing fails, fall back to simple extraction
        const pathParts = analyzedUrl.split('/').filter(Boolean)
        urlSlug = pathParts[pathParts.length - 1] || 'homepage'
      }

      // Sanitize the URL slug for filename (remove special characters)
      const sanitizedSlug = urlSlug.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-')

      console.log('[handleDownload] Starting document generation request...')
      console.log('[handleDownload] Client:', clientName, 'URL Slug:', sanitizedSlug)

      const response = await fetch('/api/generate-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisResult: results,
          settings,
          clientName,
          pageName: sanitizedSlug, // Pass the URL slug as pageName for document title
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      console.log('[handleDownload] Response received, status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[handleDownload] Error response:', errorText)
        throw new Error('Failed to generate document')
      }

      // Download the file with URL-based filename
      const blob = await response.blob()
      console.log('[handleDownload] Blob received, size:', blob.size)
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      // Sanitize client name for filename
      const sanitizedClient = clientName.replace(/[^a-zA-Z0-9_-]/g, '_')
      a.download = `${sanitizedClient}_${sanitizedSlug}_Content_Improvement.docx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(blobUrl)
      document.body.removeChild(a)

    } catch (err: unknown) {
      clearTimeout(timeoutId)
      if (err instanceof Error && err.name === 'AbortError') {
        console.error('[handleDownload] Request timed out after 90 seconds')
        alert('Document generation timed out. The content may be too large. Please try again.')
      } else {
        console.error('Download error:', err)
        alert('Failed to generate document. Please try again.')
      }
    } finally {
      setIsGeneratingDoc(false)
    }
  }

  const handleKeywordsLoaded = (loadedKeywords: KeywordData) => {
    setKeywords(loadedKeywords)
  }

  const handleSurferDataLoaded = (loadedKeywords: KeywordData, loadedSurferReport: SurferSEOReport) => {
    // Merge with existing keywords if any
    if (keywords) {
      const mergedKeywords: KeywordData = {
        primary: [...new Set([...keywords.primary, ...loadedKeywords.primary])],
        secondary: [...new Set([...keywords.secondary, ...loadedKeywords.secondary])],
        nlpTerms: [...new Set([...keywords.nlpTerms, ...loadedKeywords.nlpTerms])],
        questions: [...new Set([...keywords.questions, ...loadedKeywords.questions])],
        longTail: [...new Set([...keywords.longTail, ...loadedKeywords.longTail])],
        all: [...new Set([...keywords.all, ...loadedKeywords.all])],
      }
      setKeywords(mergedKeywords)
    } else {
      setKeywords(loadedKeywords)
    }
    setSurferReport(loadedSurferReport)
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* URL Input Section */}
          <UrlInput
            onAnalyze={handleAnalyze}
            isAnalyzing={isAnalyzing}
            disabled={isAnalyzing}
          />

          {/* SurferSEO Import */}
          <SurferInput
            onDataLoaded={handleSurferDataLoaded}
            disabled={isAnalyzing}
          />

          {/* Custom Instructions */}
          <CustomInstructionsInput
            value={customInstructions}
            onChange={setCustomInstructions}
            disabled={isAnalyzing}
          />

          {/* Keyword Upload and Settings */}
          <div className="grid gap-6 md:grid-cols-2">
            <KeywordUpload
              onKeywordsLoaded={handleKeywordsLoaded}
              keywords={keywords}
              disabled={isAnalyzing}
            />
            <SettingsPanel
              settings={settings}
              onSettingsChange={setSettings}
              disabled={isAnalyzing}
            />
          </div>

          {/* Analysis Progress */}
          {isAnalyzing && (
            <AnalysisProgress
              steps={progressSteps}
              currentMessage={currentMessage}
              onCancel={handleCancel}
              error={error}
            />
          )}

          {/* Results Preview */}
          {results && !isAnalyzing && (
            <ResultsPreview
              results={results}
              settings={settings}
              onDownload={handleDownload}
              isGenerating={isGeneratingDoc}
            />
          )}

          {/* Error Display (when not in progress) */}
          {error && !isAnalyzing && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
              <p className="font-medium">Analysis Failed</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t py-6 mt-12">
        <div className="container text-center text-sm text-muted-foreground">
          <p>SEO Content Optimizer - Analyze, optimize, and export SEO-ready content</p>
        </div>
      </footer>
    </div>
  )
}

function getProgressMessage(stepId: string): string {
  const messages: Record<string, string> = {
    crawl: 'Crawling page content...',
    meta: 'Extracting meta data and titles...',
    headings: 'Analyzing heading structure...',
    schema: 'Detecting schema markup...',
    keywords: 'Processing and analyzing keywords...',
    generate: 'Generating AI-powered recommendations...',
  }
  return messages[stepId] || 'Processing...'
}
