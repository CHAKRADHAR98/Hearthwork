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
            className={`relative bg-transparent border border-cyber-cyan text-cyber-cyan font-semibold text-sm py-3 px-6 rounded-sm transition-all duration-300 hover:bg-cyber-cyan/10 hover:shadow-[0_0_20px_rgba(0,245,255,0.4)] active:scale-95 tracking-widest uppercase ${disabled ? 'pointer-events-none opacity-40 border-gray-600 text-gray-600' : ''} ${className}`}
            onClick={onClick}
        >
            {children}
        </button>
    )
}

export default BasicButton