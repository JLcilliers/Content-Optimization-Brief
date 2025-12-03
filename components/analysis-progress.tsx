"use client"

import { CheckCircle, Circle, Loader2, XCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"

interface ProgressStep {
  id: string
  label: string
  status: 'pending' | 'in_progress' | 'completed' | 'error'
}

interface AnalysisProgressProps {
  steps: ProgressStep[]
  currentMessage: string
  onCancel: () => void
  error?: string
}

export function AnalysisProgress({ steps, currentMessage, onCancel, error }: AnalysisProgressProps) {
  const completedSteps = steps.filter(s => s.status === 'completed').length
  const progress = (completedSteps / steps.length) * 100

  const getStepIcon = (status: ProgressStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-success" />
      case 'in_progress':
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />
      case 'error':
        return <XCircle className="h-5 w-5 text-destructive" />
      default:
        return <Circle className="h-5 w-5 text-muted-foreground" />
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Analysis in Progress</span>
          <span className="text-sm font-normal text-muted-foreground">
            {completedSteps} of {steps.length} steps
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Progress value={progress} className="h-2" />

        <div className="space-y-3">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                step.status === 'in_progress' ? 'bg-primary/5' :
                step.status === 'completed' ? 'bg-success/5' :
                step.status === 'error' ? 'bg-destructive/5' :
                'bg-muted/30'
              }`}
            >
              {getStepIcon(step.status)}
              <span className={`text-sm ${
                step.status === 'pending' ? 'text-muted-foreground' : ''
              }`}>
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {currentMessage && !error && (
          <div className="text-sm text-muted-foreground text-center">
            {currentMessage}
          </div>
        )}

        {error && (
          <div className="p-3 bg-destructive/10 rounded-lg text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-center">
          <Button variant="outline" onClick={onCancel}>
            Cancel Analysis
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
