"use client"

import { Settings as SettingsIcon, ChevronDown, ChevronUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useState } from "react"
import type { Settings } from "@/types"

interface SettingsPanelProps {
  settings: Settings
  onSettingsChange: (settings: Settings) => void
  disabled?: boolean
}

export function SettingsPanel({ settings, onSettingsChange, disabled }: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false)

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onSettingsChange({ ...settings, [key]: value })
  }

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="text-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5 text-muted-foreground" />
                Settings
              </div>
              {isOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Brand Name */}
            <div className="space-y-2">
              <Label htmlFor="brandName">Brand Name</Label>
              <Input
                id="brandName"
                placeholder="e.g., Tricoci University"
                value={settings.brandName}
                onChange={(e) => updateSetting('brandName', e.target.value)}
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground">
                Used as suffix in meta title (e.g., " | Brand Name")
              </p>
            </div>

            {/* Character Limits */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="titleMaxLength">Meta Title Max Length</Label>
                <Input
                  id="titleMaxLength"
                  type="number"
                  min={40}
                  max={70}
                  value={settings.titleMaxLength}
                  onChange={(e) => updateSetting('titleMaxLength', parseInt(e.target.value) || 60)}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="descriptionMaxLength">Meta Description Max</Label>
                <Input
                  id="descriptionMaxLength"
                  type="number"
                  min={120}
                  max={170}
                  value={settings.descriptionMaxLength}
                  onChange={(e) => updateSetting('descriptionMaxLength', parseInt(e.target.value) || 160)}
                  disabled={disabled}
                />
              </div>
            </div>

            {/* Content Tone */}
            <div className="space-y-2">
              <Label htmlFor="tone">Content Tone</Label>
              <Select
                value={settings.tone}
                onValueChange={(value: 'professional' | 'friendly' | 'authoritative') =>
                  updateSetting('tone', value)
                }
                disabled={disabled}
              >
                <SelectTrigger id="tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="authoritative">Authoritative</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Schema Recommendations Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="schemaToggle">Include Schema Recommendations</Label>
                <p className="text-xs text-muted-foreground">
                  Generate JSON-LD schema markup suggestions
                </p>
              </div>
              <Switch
                id="schemaToggle"
                checked={settings.includeSchemaRecommendations}
                onCheckedChange={(checked) => updateSetting('includeSchemaRecommendations', checked)}
                disabled={disabled}
              />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
