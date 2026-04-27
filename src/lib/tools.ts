// src/lib/tools.ts
export interface ToolDef {
  id: string;          // Sent to the API in tools_to_use
  label: string;
  category: string;
  icon?: string;       // Ionicons name
}

export const TOOL_CATALOG: ToolDef[] = [
  // Web / Search
  { id: 'web_search',         label: 'Web Search',        category: 'Web & Search', icon: 'globe-outline' },
  { id: 'web_browse',         label: 'Browse URL',        category: 'Web & Search', icon: 'link-outline' },
  { id: 'news_search',        label: 'News Search',       category: 'Web & Search', icon: 'newspaper-outline' },

  // Code
  { id: 'code_execution',     label: 'Code Execution',    category: 'Code',         icon: 'code-slash-outline' },
  { id: 'python',             label: 'Python Runtime',    category: 'Code',         icon: 'terminal-outline' },

  // Location & Weather
  { id: 'weather',            label: 'Weather',           category: 'Location & Weather', icon: 'partly-sunny-outline' },
  { id: 'location_lookup',    label: 'Location Lookup',   category: 'Location & Weather', icon: 'location-outline' },
  { id: 'maps',               label: 'Maps',              category: 'Location & Weather', icon: 'map-outline' },

  // Documents
  { id: 'document_processing',label: 'Document Processing', category: 'Documents',  icon: 'document-text-outline' },
  { id: 'pdf_reader',         label: 'PDF Reader',        category: 'Documents',    icon: 'document-outline' },
];

export function groupedTools(): { category: string; tools: ToolDef[] }[] {
  const map = new Map<string, ToolDef[]>();
  for (const t of TOOL_CATALOG) {
    if (!map.has(t.category)) map.set(t.category, []);
    map.get(t.category)!.push(t);
  }
  return Array.from(map.entries()).map(([category, tools]) => ({ category, tools }));
}