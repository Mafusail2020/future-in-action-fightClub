import type { ReactNode } from 'react'
import { Children, Fragment, isValidElement, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { RagSource, SourcesMap } from '../../api/types'

const MARKER = /\[(S\d{1,2})\]/g

/** Replace [S#] markers inside rendered markdown with citation chips. */
function withCitations(children: ReactNode, sources: SourcesMap): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === 'string') {
      const parts: ReactNode[] = []
      let last = 0
      for (const match of child.matchAll(MARKER)) {
        const label = match[1]
        parts.push(child.slice(last, match.index))
        const source = sources[label]
        // Unknown label (model invented it, or stream aborted before `sources`):
        // drop the marker entirely rather than showing a dead chip.
        if (source) parts.push(<SourceChip key={match.index} label={label} source={source} />)
        last = match.index! + match[0].length
      }
      if (parts.length === 0) return child
      parts.push(child.slice(last))
      return <Fragment>{parts}</Fragment>
    }
    if (isValidElement<{ children?: ReactNode }>(child) && child.props.children) {
      return {
        ...child,
        props: { ...child.props, children: withCitations(child.props.children, sources) },
      }
    }
    return child
  })
}

function SourceChip({ label, source }: { label: string; source: RagSource }) {
  const [open, setOpen] = useState(false)
  const n = label.slice(1)

  return (
    <span className="relative inline-block">
      <button
        type="button"
        className="cite-chip"
        aria-label={`Джерело ${n}: ${source.title}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        {n}
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-[1.9em] left-0 z-30 block w-60 rounded-lg border border-border-subtle bg-bg-elevated p-2.5 text-left shadow-xl"
        >
          <span className="block font-mono text-[10px] tracking-[0.12em] text-text-tertiary uppercase">
            {source.type === 'solution' ? 'Кейс міста' : 'Документ про ваше місто'}
            {source.city ? ` · ${source.city}` : ''}
          </span>
          <span className="mt-1 block text-xs leading-snug font-medium text-text-primary">
            {source.url ? (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="text-amber underline underline-offset-2"
                onMouseDown={(e) => e.preventDefault()}
              >
                {source.title}
              </a>
            ) : (
              source.title
            )}
          </span>
          {source.type === 'solution' && source.solution_id && (
            <a
              href={`/solution/${source.solution_id}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-[11px] text-accent underline underline-offset-2"
              onMouseDown={(e) => e.preventDefault()}
            >
              Відкрити повний кейс ↗
            </a>
          )}
        </span>
      )}
    </span>
  )
}

/** Assistant answer: markdown, external links, [S#] citation chips. */
export function AssistantMarkdown({
  content,
  sources,
}: {
  content: string
  sources?: SourcesMap
}) {
  const cite = (props: { children?: ReactNode }) =>
    sources && Object.keys(sources).length > 0
      ? withCitations(props.children, sources)
      : props.children

  return (
    <div className="md-body text-[14.5px]">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
          p: (props) => <p>{cite(props)}</p>,
          li: (props) => <li>{cite(props)}</li>,
          td: (props) => <td>{cite(props)}</td>,
          strong: (props) => <strong>{cite(props)}</strong>,
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}
