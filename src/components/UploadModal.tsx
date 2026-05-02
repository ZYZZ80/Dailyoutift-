import { useState, useRef } from 'react'
import { X, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { ClothingItem, ClothingCategory } from '../types'
interface Props {
  onClose: () => void
  onAdded: () => void
}

const CATEGORIES: ClothingCategory[] = [
  'top', 'bottom', 'dress', 'shoes', 'accessory', 'outerwear'
]

export default function UploadModal({ onClose, onAdded }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [category, setCategory] = useState<ClothingCategory>('top')
  const [color, setColor] = useState('')
  const [tags, setTags] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(f: File) {
    setFile(f)
    setPreview(URL.createObjectURL(f)) // ✅ FIX iPad preview
  }

  async function handleSave() {
    if (!file || !name.trim()) return

    setSaving(true)

    try {
      const filePath = `${Date.now()}-${file.name}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('wardrobe-images')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data } = supabase.storage
        .from('wardrobe-images')
        .getPublicUrl(filePath)

      const imageUrl = data.publicUrl

      const item: ClothingItem = {
        id: crypto.randomUUID(),
        name: name.trim(),
        category,
        color,
        image: imageUrl,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        uploadedAt: new Date().toISOString(),
      }

      // Save to DB
      const { error } = await supabase
        .from('wardrobe_items')
        .insert({ id: item.id, data: item })

      if (error) throw error

      onAdded()
      onClose()

    } catch (e) {
      alert('Error: ' + (e instanceof Error ? e.message : e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4">

        <div className="flex justify-between items-center">
          <h2 className="font-semibold">Add Item</h2>
          <button onClick={onClose}><X /></button>
        </div>

        {/* Upload */}
        <div
          className="border-2 border-dashed p-4 text-center cursor-pointer"
          onClick={() => fileRef.current?.click()}
        >
          {preview ? (
            <img src={preview} className="max-h-40 mx-auto" />
          ) : (
            <p>Click to upload</p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>

        {/* Fields */}
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border p-2 rounded"
        />

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ClothingCategory)}
          className="w-full border p-2 rounded"
        >
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>

        <input
          placeholder="Color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-full border p-2 rounded"
        />

        <input
          placeholder="Tags (comma separated)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="w-full border p-2 rounded"
        />

        <button
          onClick={handleSave}
          disabled={!file || !name || saving}
          className="w-full bg-black text-white py-2 rounded flex justify-center gap-2"
        >
          {saving ? <Loader2 className="animate-spin" /> : 'Save'}
        </button>

      </div>
    </div>
  )
}
