import * as m from '../paraglide/messages'

type UndeleteMode = 'all-missing' | 'directory-missing' | 'specific'

interface UndeleteModeSelectProps {
  mode: UndeleteMode
  onChange: (mode: UndeleteMode) => void
}

export const UndeleteModeSelector = ({ mode, onChange }: UndeleteModeSelectProps) => {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-3">
        {m.undelete_mode_label()}
      </label>
      <div className="space-y-2">
        <label className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-50">
          <input
            type="radio"
            name="mode"
            value="all-missing"
            checked={mode === 'all-missing'}
            onChange={(e) => onChange(e.target.value as UndeleteMode)}
            className="mr-3"
          />
          <div>
            <div className="font-medium">{m.undelete_all_missing()}</div>
            <div className="text-sm text-gray-600">snapraid fix -m</div>
          </div>
        </label>

        <label className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-50">
          <input
            type="radio"
            name="mode"
            value="directory-missing"
            checked={mode === 'directory-missing'}
            onChange={(e) => onChange(e.target.value as UndeleteMode)}
            className="mr-3"
          />
          <div>
            <div className="font-medium">{m.undelete_directory_missing()}</div>
            <div className="text-sm text-gray-600">snapraid fix -m -f DIR/</div>
          </div>
        </label>

        <label className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-50">
          <input
            type="radio"
            name="mode"
            value="specific"
            checked={mode === 'specific'}
            onChange={(e) => onChange(e.target.value as UndeleteMode)}
            className="mr-3"
          />
          <div>
            <div className="font-medium">{m.undelete_specific_file()}</div>
            <div className="text-sm text-gray-600">snapraid fix -f FILE</div>
          </div>
        </label>
      </div>
    </div>
  )
}
