"use client"

import { useState } from "react"
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Download,
  Tag,
  FileText,
  Heading1,
  ListTree,
  Code2,
  MessageSquare
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { AnalysisResult, Settings } from "@/types"
import { getCharacterCountColor } from "@/lib/utils"

interface ResultsPreviewProps {
  results: AnalysisResult
  settings: Settings
  onDownload: () => void
  isGenerating: boolean
}

interface CollapsibleSectionProps {
  title: string
  icon: React.ReactNode
  current: string
  recommended: string
  charLimits?: { min: number; max: number }
  defaultOpen?: boolean
}

function CollapsibleSection({
  title,
  icon,
  current,
  recommended,
  charLimits,
  defaultOpen = false
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [copiedCurrent, setCopiedCurrent] = useState(false)
  const [copiedRecommended, setCopiedRecommended] = useState(false)

  const copyToClipboard = async (text: string, type: 'current' | 'recommended') => {
    await navigator.clipboard.writeText(text)
    if (type === 'current') {
      setCopiedCurrent(true)
      setTimeout(() => setCopiedCurrent(false), 2000)
    } else {
      setCopiedRecommended(true)
      setTimeout(() => setCopiedRecommended(false), 2000)
    }
  }

  const currentLength = current?.length || 0
  const recommendedLength = recommended?.length || 0

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 rounded-lg transition-colors">
          <div className="flex items-center gap-3">
            {icon}
            <span className="font-medium">{title}</span>
          </div>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-4 space-y-4">
          {/* Current */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Current</span>
              <div className="flex items-center gap-2">
                {charLimits && (
                  <span className={`text-xs ${getCharacterCountColor(currentLength, charLimits.min, charLimits.max)}`}>
                    {currentLength} chars
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(current, 'current')}
                  className="h-7 px-2"
                >
                  {copiedCurrent ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg text-sm">
              {current || <span className="text-muted-foreground italic">Not found</span>}
            </div>
          </div>

          {/* Recommended */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-success">Recommended</span>
              <div className="flex items-center gap-2">
                {charLimits && (
                  <span className={`text-xs ${getCharacterCountColor(recommendedLength, charLimits.min, charLimits.max)}`}>
                    {recommendedLength} chars
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(recommended, 'recommended')}
                  className="h-7 px-2"
                >
                  {copiedRecommended ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>
            <div className="p-3 bg-success/5 border border-success/20 rounded-lg text-sm">
              {recommended || <span className="text-muted-foreground italic">No recommendation</span>}
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ResultsPreview({ results, settings, onDownload, isGenerating }: ResultsPreviewProps) {
  const { crawledData, seoAnalysis, optimizedContent } = results

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Analysis Results</span>
          <Button onClick={onDownload} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Generating...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download Report
              </>
            )}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <CollapsibleSection
          title="Meta Title"
          icon={<Tag className="h-4 w-4 text-muted-foreground" />}
          current={crawledData.title}
          recommended={optimizedContent.metaTitle}
          charLimits={{ min: 50, max: 60 }}
          defaultOpen={true}
        />

        <CollapsibleSection
          title="Meta Description"
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
          current={crawledData.metaDescription}
          recommended={optimizedContent.metaDescription}
          charLimits={{ min: 150, max: 160 }}
          defaultOpen={true}
        />

        <CollapsibleSection
          title="H1 Heading"
          icon={<Heading1 className="h-4 w-4 text-muted-foreground" />}
          current={crawledData.h1[0] || ''}
          recommended={optimizedContent.h1}
          defaultOpen={true}
        />

        {/* Heading Structure */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 rounded-lg transition-colors">
              <div className="flex items-center gap-3">
                <ListTree className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Heading Structure</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-2">
              {seoAnalysis.headingStructure.h1.length > 0 && (
                <div className="text-sm">
                  <span className="font-medium">H1 ({seoAnalysis.headingStructure.h1.length}):</span>
                  <ul className="ml-4 mt-1 text-muted-foreground">
                    {seoAnalysis.headingStructure.h1.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </div>
              )}
              {seoAnalysis.headingStructure.h2.length > 0 && (
                <div className="text-sm">
                  <span className="font-medium">H2 ({seoAnalysis.headingStructure.h2.length}):</span>
                  <ul className="ml-4 mt-1 text-muted-foreground">
                    {seoAnalysis.headingStructure.h2.slice(0, 5).map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                    {seoAnalysis.headingStructure.h2.length > 5 && (
                      <li className="italic">+{seoAnalysis.headingStructure.h2.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
              {seoAnalysis.headingStructure.h3.length > 0 && (
                <div className="text-sm">
                  <span className="font-medium">H3 ({seoAnalysis.headingStructure.h3.length}):</span>
                  <ul className="ml-4 mt-1 text-muted-foreground">
                    {seoAnalysis.headingStructure.h3.slice(0, 3).map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                    {seoAnalysis.headingStructure.h3.length > 3 && (
                      <li className="italic">+{seoAnalysis.headingStructure.h3.length - 3} more</li>
                    )}
                  </ul>
                </div>
              )}
              {!seoAnalysis.headingStructure.hasProperHierarchy && (
                <div className="mt-2 p-2 bg-warning/10 rounded text-sm text-warning">
                  Warning: Heading hierarchy issues detected
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Schema Detection */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 rounded-lg transition-colors">
              <div className="flex items-center gap-3">
                <Code2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Schema Markup</span>
                {seoAnalysis.schemaTypes.length > 0 ? (
                  <span className="px-2 py-0.5 bg-success/10 text-success text-xs rounded">
                    {seoAnalysis.schemaTypes.length} found
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-warning/10 text-warning text-xs rounded">
                    None detected
                  </span>
                )}
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4">
              {seoAnalysis.schemaTypes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {seoAnalysis.schemaTypes.map((type, i) => (
                    <span key={i} className="px-2 py-1 bg-muted text-sm rounded">
                      {type}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No schema markup detected on this page.
                </p>
              )}
              {settings.includeSchemaRecommendations && optimizedContent.schemaRecommendations.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium mb-2">Recommended Schema:</p>
                  <div className="flex flex-wrap gap-2">
                    {optimizedContent.schemaRecommendations.map((rec, i) => (
                      <span key={i} className="px-2 py-1 bg-success/10 text-success text-sm rounded">
                        {rec.type}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Keyword Summary */}
        {results.keywords.all.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 rounded-lg transition-colors">
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Keyword Integration</span>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">In Title:</span>
                    <span className={`ml-2 ${seoAnalysis.keywordAnalysis.primaryInTitle ? 'text-success' : 'text-warning'}`}>
                      {seoAnalysis.keywordAnalysis.primaryInTitle ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">In Description:</span>
                    <span className={`ml-2 ${seoAnalysis.keywordAnalysis.primaryInDescription ? 'text-success' : 'text-warning'}`}>
                      {seoAnalysis.keywordAnalysis.primaryInDescription ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">In H1:</span>
                    <span className={`ml-2 ${seoAnalysis.keywordAnalysis.primaryInH1 ? 'text-success' : 'text-warning'}`}>
                      {seoAnalysis.keywordAnalysis.primaryInH1 ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">In First 100 Words:</span>
                    <span className={`ml-2 ${seoAnalysis.keywordAnalysis.primaryInFirst100Words ? 'text-success' : 'text-warning'}`}>
                      {seoAnalysis.keywordAnalysis.primaryInFirst100Words ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
                {seoAnalysis.keywordAnalysis.missingKeywords.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-warning mb-1">Missing Keywords:</p>
                    <div className="flex flex-wrap gap-1">
                      {seoAnalysis.keywordAnalysis.missingKeywords.slice(0, 5).map((kw, i) => (
                        <span key={i} className="px-2 py-0.5 bg-warning/10 text-warning text-xs rounded">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  )
}
