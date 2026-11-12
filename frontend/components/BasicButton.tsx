import React from 'react'

type BasicButtonProps = {
    children?: React.ReactNode
    className?: string
    onClick?: () => void
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
}

const BasicButton:React.FC<BasicButtonProps> = ({ children, className, onClick, disabled, type = 'button' }) => {

    return (
        <button
            type={type}
            disabled={disabled}
            className={`relative inline-flex items-center justify-center bg-hearth-honey text-hearth-ink font-bold text-sm py-2.5 px-5 rounded-xl shadow-[0_4px_0_#7a5a16] transition-[transform,box-shadow,background-color] hover:bg-[#ecc95a] active:translate-y-[2px] active:shadow-[0_2px_0_#7a5a16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hearth-parchment disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
            onClick={onClick}
        >
            {children}
        </button>
    )
}

export default BasicButton