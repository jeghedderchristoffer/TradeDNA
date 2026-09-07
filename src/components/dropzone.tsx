import { Upload } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export function Dropzone({
  accept,
  onFile,
  title,
  hint,
  disabled,
  className,
}: {
  accept: string
  onFile: (file: File) => void
  title: string
  hint?: string
  disabled?: boolean
  className?: string
}) {
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()

  const pick = (files: FileList | null) => {
    const f = files?.[0]
    if (f) onFile(f)
  }

  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!disabled) pick(e.dataTransfer.files)
      }}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer',
        over ? 'border-ring bg-accent' : 'hover:bg-accent/60',
        disabled && 'opacity-50 pointer-events-none',
        className,
      )}
    >
      <Upload className="size-6 text-muted-foreground" />
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          pick(e.target.files)
          e.target.value = ''
        }}
      />
    </label>
  )
}
