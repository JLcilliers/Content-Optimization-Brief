"use client"

import { useState } from "react"
import { Globe, AlertCircle, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { isValidUrl } from "@/lib/utils"

interface UrlInputProps {
  onAnalyze: (url: string) => void
  isAnalyzing: boolean
  disabled?: boolean
}

export function UrlInput({ onAnalyze, isAnalyzing, disabled }: UrlInputProps) {
  const [url, setUrl] = useState("")
  const [error, setError] = useState("")
  const [isValid, setIsValid] = useState<boolean | null>(null)

  const validateUrl = (value: string) => {
    if (!value) {
      setIsValid(null)
      setError("")
      return
    }

    if (isValidUrl(value)) {
      setIsValid(true)
      setError("")
    } else {
      setIsValid(false)
      setError("Please enter a valid URL starting with http:// or https://")
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setUrl(value)
    validateUrl(value)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isValid && url) {
      onAnalyze(url)
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                Page URL to Analyze
              </label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Enter the page URL to analyze..."
                  value={url}
                  onChange={handleChange}
                  disabled={isAnalyzing || disabled}
                  className={`pr-10 h-12 text-base ${
                    isValid === false ? "border-destructive focus-visible:ring-destructive" :
                    isValid === true ? "border-success focus-visible:ring-success" : ""
                  }`}
                />
                {isValid !== null && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {isValid ? (
                      <CheckCircle className="h-5 w-5 text-success" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    )}
                  </div>
                )}
              </div>
              {error && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {error}
                </p>
              )}
            </div>

            <Button
              type="submit"
              size="xl"
              disabled={!isValid || isAnalyzing || disabled}
              className="w-full sm:w-auto sm:self-start"
            >
              {isAnalyzing ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Analyzing...
                </>
              ) : (
                "Analyze Page"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
