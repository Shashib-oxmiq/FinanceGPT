// ── Modal Component ──────────────────────────────────────────────────────────
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal as RNModal, ScrollView, TouchableWithoutFeedback } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";

export default function Modal({ visible, onClose, title, children, footer }) {
  return (
    <RNModal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.content}>
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close" size={22} color={theme.muted} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 16 }}>
                {children}
              </ScrollView>
              {footer && <View style={styles.footer}>{footer}</View>}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  content: { backgroundColor: theme.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", paddingBottom: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: theme.border },
  title: { fontSize: 18, fontWeight: "700", color: theme.text },
  body: { padding: 20 },
  footer: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border },
});