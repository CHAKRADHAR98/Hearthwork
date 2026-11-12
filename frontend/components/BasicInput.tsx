import React from 'react'

type BasicInputProps = {
    label?: string
    className?: string
    value?: string | number
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
    type?: 'number' | 'text' | 'password'
    maxLength?: number
    minLength?: number
    placeholder?: string
    required?: boolean
}

const BasicInput:React.FC<BasicInputProps> = ({ label, className, value, onChange, type, maxLength, minLength, placeholder, required }) => {
    
    if (!type) {
        type = 'text'
    }

    return (
        <div>
        {label && (
            <label className="block text-xs font-semibold leading-6 text-cyber-cyan tracking-widest uppercase mb-1 font-orbitron">
                {label}
            </label>
        )}
        <div className="mt-1">
            <input
                type={type}
                className={`w-full bg-dark-panel border border-panel-border text-white py-2.5 px-3 rounded-sm outline-none text-sm leading-6 placeholder:text-gray-600 transition-all duration-200 focus:border-cyber-cyan focus:shadow-[0_0_12px_rgba(0,245,255,0.25)] ${className}`}
                autoComplete='off'
                placeholder={placeholder || ""}
                value={value}
                onChange={onChange}
                maxLength={maxLength}
                minLength={minLength}
                required={required}
                spellCheck={false}
            />
        </div>
        </div>
  )
}

export default BasicInput