import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
  StatusBar,
} from 'react-native';
import { router } from 'expo-router';

const SECRET_CODE = '200574';

export default function CalculatorScreen() {
  const [display, setDisplay] = useState('0');
  const [input, setInput] = useState('');
  const [operator, setOperator] = useState<string | null>(null);
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [justEvaluated, setJustEvaluated] = useState(false);
  const [secretBuffer, setSecretBuffer] = useState('');

  const handleNumber = (num: string) => {
    const newBuffer = secretBuffer + num;
    setSecretBuffer(newBuffer);

    if (justEvaluated) {
      setDisplay(num);
      setInput(num);
      setJustEvaluated(false);
    } else {
      const newVal = display === '0' ? num : display + num;
      setDisplay(newVal);
      setInput(newVal);
    }
  };

  const handleOperator = (op: string) => {
    setSecretBuffer('');
    setJustEvaluated(false);
    const current = parseFloat(display);
    if (prevValue !== null && operator && !justEvaluated) {
      const result = calculate(prevValue, current, operator);
      setDisplay(String(result));
      setPrevValue(result);
    } else {
      setPrevValue(current);
    }
    setOperator(op);
    setInput('');
  };

  const calculate = (a: number, b: number, op: string): number => {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b !== 0 ? a / b : 0;
      default: return b;
    }
  };

  const handleEquals = () => {
    if (secretBuffer === SECRET_CODE) {
      setSecretBuffer('');
      setDisplay('0');
      setInput('');
      setOperator(null);
      setPrevValue(null);
      router.push('/vault/auth');
      return;
    }

    setSecretBuffer('');
    if (prevValue !== null && operator) {
      const current = parseFloat(display);
      const result = calculate(prevValue, current, operator);
      const resultStr = Number.isInteger(result) ? String(result) : result.toFixed(8).replace(/\.?0+$/, '');
      setDisplay(resultStr);
      setInput('');
      setOperator(null);
      setPrevValue(null);
      setJustEvaluated(true);
    }
  };

  const handleClear = () => {
    setDisplay('0');
    setInput('');
    setOperator(null);
    setPrevValue(null);
    setJustEvaluated(false);
    setSecretBuffer('');
  };

  const handleToggleSign = () => {
    const val = parseFloat(display) * -1;
    setDisplay(String(val));
  };

  const handlePercent = () => {
    const val = parseFloat(display) / 100;
    setDisplay(String(val));
  };

  const handleDecimal = () => {
    if (!display.includes('.')) {
      setDisplay(display + '.');
      setInput(input + '.');
    }
  };

  const handleBackspace = () => {
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay('0');
    }
    if (secretBuffer.length > 0) {
      setSecretBuffer(secretBuffer.slice(0, -1));
    }
  };

  const isDisplayLong = display.length > 9;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1c1c1e" />
      <View style={styles.displayArea}>
        <Text
          style={[styles.displayText, isDisplayLong && styles.displayTextSmall]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {display}
        </Text>
      </View>

      <View style={styles.buttonGrid}>
        {/* Row 1 */}
        <View style={styles.row}>
          <CalcButton label="AC" onPress={handleClear} style="func" />
          <CalcButton label="+/-" onPress={handleToggleSign} style="func" />
          <CalcButton label="%" onPress={handlePercent} style="func" />
          <CalcButton label="/" onPress={() => handleOperator('/')} style="op" active={operator === '/'} />
        </View>
        {/* Row 2 */}
        <View style={styles.row}>
          <CalcButton label="7" onPress={() => handleNumber('7')} style="num" />
          <CalcButton label="8" onPress={() => handleNumber('8')} style="num" />
          <CalcButton label="9" onPress={() => handleNumber('9')} style="num" />
          <CalcButton label="×" onPress={() => handleOperator('*')} style="op" active={operator === '*'} />
        </View>
        {/* Row 3 */}
        <View style={styles.row}>
          <CalcButton label="4" onPress={() => handleNumber('4')} style="num" />
          <CalcButton label="5" onPress={() => handleNumber('5')} style="num" />
          <CalcButton label="6" onPress={() => handleNumber('6')} style="num" />
          <CalcButton label="-" onPress={() => handleOperator('-')} style="op" active={operator === '-'} />
        </View>
        {/* Row 4 */}
        <View style={styles.row}>
          <CalcButton label="1" onPress={() => handleNumber('1')} style="num" />
          <CalcButton label="2" onPress={() => handleNumber('2')} style="num" />
          <CalcButton label="3" onPress={() => handleNumber('3')} style="num" />
          <CalcButton label="+" onPress={() => handleOperator('+')} style="op" active={operator === '+'} />
        </View>
        {/* Row 5 */}
        <View style={styles.row}>
          <CalcButton label="0" onPress={() => handleNumber('0')} style="num" wide />
          <CalcButton label="." onPress={handleDecimal} style="num" />
          <CalcButton label="=" onPress={handleEquals} style="op" />
        </View>
      </View>
    </View>
  );
}

type ButtonStyle = 'num' | 'func' | 'op';

function CalcButton({
  label,
  onPress,
  style,
  wide = false,
  active = false,
}: {
  label: string;
  onPress: () => void;
  style: ButtonStyle;
  wide?: boolean;
  active?: boolean;
}) {
  const [pressed, setPressed] = useState(false);

  const bgColor = () => {
    if (style === 'func') return pressed ? '#d4d4d2' : '#a5a5a5';
    if (style === 'op') return active ? '#ffffff' : pressed ? '#e09008' : '#ff9f0a';
    return pressed ? '#d4d4d2' : '#333333';
  };

  const textColor = () => {
    if (style === 'func') return '#1c1c1e';
    if (style === 'op') return active ? '#ff9f0a' : '#ffffff';
    return '#ffffff';
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        wide && styles.buttonWide,
        { backgroundColor: bgColor() },
      ]}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      activeOpacity={1}
    >
      <Text style={[styles.buttonText, { color: textColor() }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const BTN_SIZE = 82;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1c1c1e',
    justifyContent: 'flex-end',
    paddingBottom: 24,
  },
  displayArea: {
    paddingHorizontal: 28,
    paddingBottom: 16,
    alignItems: 'flex-end',
  },
  displayText: {
    color: '#ffffff',
    fontSize: 80,
    fontWeight: '200',
    letterSpacing: -2,
  },
  displayTextSmall: {
    fontSize: 52,
  },
  buttonGrid: {
    paddingHorizontal: 12,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  button: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonWide: {
    width: BTN_SIZE * 2 + 12,
    alignItems: 'flex-start',
    paddingLeft: 30,
  },
  buttonText: {
    fontSize: 34,
    fontWeight: '400',
  },
});
