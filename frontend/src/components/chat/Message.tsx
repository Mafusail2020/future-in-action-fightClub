import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Assistant answer: markdown with inline source links (backend cites via markdown). */
export function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="md-body text-[14.5px]">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}
