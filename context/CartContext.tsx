import { createContext, ReactNode, useContext, useReducer } from 'react';

export interface CartItem {
  productId: string;
  quantity: number;
  selectedOptionIds: string[];
}

type CartState = CartItem[];

type CartAction =
  | { type: 'ADD_ITEM'; item: CartItem }
  | { type: 'UPDATE_QUANTITY'; index: number; quantity: number }
  | { type: 'REMOVE_ITEM'; index: number }
  | { type: 'CLEAR_CART' };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM':
      return [...state, action.item];
    case 'UPDATE_QUANTITY':
      return state.map((item, index) =>
        index === action.index ? { ...item, quantity: action.quantity } : item
      );
    case 'REMOVE_ITEM':
      return state.filter((_, index) => index !== action.index);
    case 'CLEAR_CART':
      return [];
    default:
      return state;
  }
}

interface CartContextValue {
  items: CartItem[];
  dispatch: React.Dispatch<CartAction>;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, dispatch] = useReducer(cartReducer, []);

  return (
    <CartContext.Provider value={{ items, dispatch }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
