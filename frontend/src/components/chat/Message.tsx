import type { ReactNode } from 'react'
import { Children, Fragment, isValidElement } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { Citation } from '../../api/types'
import { CitationChip } from './CitationChip'

const MARKER = /\[(\d{1,2})\]/g

/** Replace [n] markers inside rendered markdown text with citation chips. */
function withCitations(children: ReactNode, citations: Citation[]): ReactNode {
  const byN = new Map(citations.map((c) => [c.n, c]))
  return Children.map(children, (child) => {
    if (typeof child === 'string') {
      const parts: ReactNode[] = []
      let last = 0
      for (const match of child.matchAll(MARKER)) {
        const n = Number(match[1])
        if (!byN.has(n)) continue
        parts.push(child.slice(last, match.index))
        parts.push(<CitationChip key={`${match.index}`} n={n} citation={byN.get(n)} />)
        last = match.index! + match[0].length
      }
      if (parts.length === 0) return child
      parts.push(child.slice(last))
      return <Fragment>{parts}</Fragment>
    }
    if (isValidElement<{ children?: ReactNode }>(child) && child.props.children) {
      // recurse into inline elements (strong/em/links) so chips survive formatting
      return { ...child, props: { ...child.props, children: withCitations(child.props.children, citations) } }
    }
    return child
  })
}

export function AssistantMarkdown({
  content,
  citations = [],
}: {
  content: string
  citations?: Citation[]
}) {
  const cite = (props: { children?: ReactNode }) => withCitations(props.children, citations)
  return (
    <div className="md-body text-[14.5px]">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (props) => <p>{cite(props)}</p>,
          li: (props) => <li>{cite(props)}</li>,
          td: (props) => <td>{cite(props)}</td>,
          th: (props) => <th>{cite(props)}</th>,
          h1: (props) => <h1>{cite(props)}</h1>,
          h2: (props) => <h2>{cite(props)}</h2>,
          h3: (props) => <h3>{cite(props)}</h3>,
          blockquote: (props) => <blockquote>{cite(props)}</blockquote>,
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}
