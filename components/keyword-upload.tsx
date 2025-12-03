"use client"

import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"
import { Upload, FileSpreadsheet, X, AlertCircle, CheckCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatFileSize } from "@/lib/utils"
import type { KeywordData } from "@/types"

interface KeywordUploadProps {
  onKeywordsLoaded: (keywords: KeywordData) => void
  keywords: KeywordData | null
  disabled?: boolean
}

export function KeywordUpload({ onKeywordsLoaded, keywords, disabled }: KeywordUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)

  const processFile = async (file: File) => {
    setIsProcessing(true)
    setError("")

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/parse-keywords', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (result.success) {
        onKeywordsLoaded(result.data)
      } else {
        setError(result.error || "Failed to process keywords file")
        setFile(null)
      }
    } catch {
      setError("Failed to process the file. Please try again.")
      setFile(null)
    } finally {
      setIsProcessing(false)
    }
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const uploadedFile = acceptedFiles[0]
    if (uploadedFile) {
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        '.xlsx',
        '.xls',
        '.csv'
      ]

      const isValidType = validTypes.some(type =>
        uploadedFile.type === type || uploadedFile.name.endsWith(type)
      )

      if (!isValidType) {
        setError("Please upload an Excel (.xlsx, .xls) or CSV file.")
        return
      }

      setFile(uploadedFile)
      setError("")
      processFile(uploadedFile)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    disabled: disabled || isProcessing,
  })

  const removeFile = () => {
    setFile(null)
    setError("")
    onKeywordsLoaded({
      primary: [],
      secondary: [],
      nlpTerms: [],
      questions: [],
      longTail: [],
      all: [],
    })
  }

  const totalKeywords = keywords?.all?.length || 0
  const previewKeywords = keywords?.all?.slice(0, 10) || []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
          Keywords File (Optional)
        </CardTitle>
        <CardDescription>
          Upload an Excel or CSV file with target keywords for optimization
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!file ? (
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
              transition-colors duration-200
              ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
              ${disabled ? "opacity-50 cursor-not-allowed" : ""}
            `}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
            {isDragActive ? (
              <p className="text-primary font-medium">Drop the file here...</p>
            ) : (
              <>
                <p className="font-medium mb-1">Drag & drop your keywords file here</p>
                <p className="text-sm text-muted-foreground">or click to browse</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Supports .xlsx, .xls, .csv
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="h-8 w-8 text-primary" />
                <div>
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={removeFile}
                disabled={isProcessing}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {isProcessing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Processing keywords...
              </div>
            )}

            {keywords && totalKeywords > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle className="h-4 w-4" />
                  {totalKeywords} keywords detected
                </div>

                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Preview:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {previewKeywords.map((keyword, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 text-xs bg-background rounded border"
                      >
                        {keyword}
                      </span>
                    ))}
                    {totalKeywords > 10 && (
                      <span className="px-2 py-1 text-xs text-muted-foreground">
                        +{totalKeywords - 10} more
                      </span>
                    )}
                  </div>
                </div>

                {keywords.primary.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Primary: </span>
                    {keywords.primary.slice(0, 3).join(", ")}
                    {keywords.primary.length > 3 && ` +${keywords.primary.length - 3} more`}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
