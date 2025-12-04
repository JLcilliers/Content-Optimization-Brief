// Core data types for SEO Content Optimizer

export interface CrawledData {
  url: string;
  title: string;
  metaDescription: string;
  h1: string[];
  h2: string[];
  h3: string[];
  h4: string[];
  h5: string[];
  h6: string[];
  bodyContent: string;
  schemaMarkup: SchemaMarkup[];
  canonicalUrl: string;
  ogTitle: string;
  ogDescription: string;
  wordCount: number;
  internalLinks: string[];
  externalLinks: string[];
  images: ImageData[];
}

export interface SchemaMarkup {
  type: string;
  data: Record<string, unknown>;
}

export interface ImageData {
  src: string;
  alt: string;
  hasAlt: boolean;
}

export interface KeywordData {
  primary: string[];
  secondary: string[];
  nlpTerms: string[];
  questions: string[];
  longTail: string[];
  all: string[];
}

export interface SEOAnalysis {
  currentTitle: string;
  currentDescription: string;
  currentH1: string;
  titleLength: number;
  descriptionLength: number;
  h1Count: number;
  headingStructure: HeadingStructure;
  keywordAnalysis: KeywordAnalysisResult;
  schemaTypes: string[];
  issues: SEOIssue[];
  score: number;
}

export interface HeadingStructure {
  h1: string[];
  h2: string[];
  h3: string[];
  h4: string[];
  h5: string[];
  h6: string[];
  hasProperHierarchy: boolean;
  issues: string[];
}

export interface KeywordAnalysisResult {
  primaryInTitle: boolean;
  primaryInDescription: boolean;
  primaryInH1: boolean;
  primaryInFirst100Words: boolean;
  keywordDensity: Record<string, number>;
  missingKeywords: string[];
  overusedKeywords: string[];
}

export interface SEOIssue {
  type: 'error' | 'warning' | 'info';
  category: 'title' | 'description' | 'h1' | 'headings' | 'content' | 'schema' | 'keywords';
  message: string;
  recommendation: string;
}

export interface OptimizedContent {
  metaTitle: string;
  metaDescription: string;
  h1: string;
  fullContent: string;
  faqs: FAQ[];
  schemaRecommendations: SchemaRecommendation[];
}

export interface FAQ {
  question: string;
  answer: string;
}

export interface SchemaRecommendation {
  type: string;
  reason: string;
  jsonLd: string;
}

export interface AnalysisResult {
  crawledData: CrawledData;
  seoAnalysis: SEOAnalysis;
  optimizedContent: OptimizedContent;
  keywords: KeywordData;
}

export interface AnalysisProgress {
  step: number;
  totalSteps: number;
  currentStep: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  message: string;
}

export interface Settings {
  brandName: string;
  titleMaxLength: number;
  descriptionMaxLength: number;
  tone: 'professional' | 'friendly' | 'authoritative';
  includeSchemaRecommendations: boolean;
}

export interface DocumentGenerationRequest {
  analysisResult: AnalysisResult;
  settings: Settings;
  clientName: string;
  pageName: string;
}

// API Response types
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AnalyzeRequest {
  url: string;
  keywords: KeywordData;
  settings: Settings;
}

// SurferSEO Report Types
export interface SurferSEOReport {
  url: string;
  auditedUrl?: string;
  targetKeyword: string;
  contentScore: number;
  wordCountTarget: {
    min: number;
    max: number;
    recommended: number;
  };
  headings: {
    h2Count: { min: number; max: number; recommended: number };
    h3Count: { min: number; max: number; recommended: number };
  };
  keywords: SurferKeyword[];
  nlpTerms: SurferNLPTerm[];
  questions: string[];
  competitors: SurferCompetitor[];
  structureRecommendations: string[];
}

export interface SurferKeyword {
  term: string;
  importance: 'high' | 'medium' | 'low';
  usageTarget: {
    min: number;
    max: number;
    recommended: number;
  };
  currentUsage?: number;
  currentCount?: number | null;
  status?: 'missing' | 'low' | 'good' | 'overused' | 'unknown';
  action?: string | null;
  relevance?: number | null;
  isNLP?: boolean;
}

export interface SurferNLPTerm {
  term: string;
  relevance: number;
  usageTarget: number;
  currentUsage?: number;
  currentCount?: number | null;
  status?: 'missing' | 'low' | 'good' | 'overused' | 'unknown';
  action?: string | null;
}

export interface SurferCompetitor {
  url: string;
  title: string;
  wordCount: number;
  contentScore: number;
}

export interface SurferAnalyzeRequest {
  surferUrl: string;
}

// Error messages for user-facing errors
export const ErrorMessages = {
  INVALID_URL: "Please enter a valid URL starting with http:// or https://",
  URL_NOT_FOUND: "We couldn't access this page. Please check the URL and try again.",
  CRAWL_TIMEOUT: "The page took too long to load. This might be a temporary issue - please try again.",
  INVALID_FILE: "Please upload an Excel (.xlsx, .xls) or CSV file.",
  EMPTY_KEYWORDS: "The uploaded file doesn't contain any keywords. Please check the file.",
  API_ERROR: "Something went wrong on our end. Please try again in a moment.",
  RATE_LIMIT: "Too many requests. Please wait a moment before trying again.",
  MISSING_API_KEY: "API key is not configured. Please check your environment variables.",
} as const;
